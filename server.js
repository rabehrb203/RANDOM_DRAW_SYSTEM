const express = require("express");
const basicAuth = require("express-basic-auth");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const { sequelize, Member, Winner } = require("./models");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PRIZE_LIMITS = {
  20: 500,
  30: 60,
  40: 40,
};

const adminAuth = basicAuth({
  users: { admin: "admin123" },
  challenge: true,
  realm: "Admin Area",
});

app.get("/check-participant/:id", async (req, res) => {
  try {
    const participantId = req.params.id.trim();
    const count = await Member.count();

    if (count === 0) {
      return res.json({ found: false, error: "Database is empty" });
    }

    const member = await Member.findOne({ where: { phone: participantId } });

    if (member) {
      const winner = await Winner.findOne({ where: { phone: participantId } });

      res.json({
        found: true,
        name: member.name,
        id: member.phone,
        hasWon: !!winner,
      });
    } else {
      res.json({ found: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/draw-prize", async (req, res) => {
  try {
    const { participantId, prize } = req.body;

    const member = await Member.findOne({ where: { phone: participantId } });
    if (!member) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const existingWinner = await Winner.findOne({
      where: { phone: participantId },
    });
    if (existingWinner) {
      return res.status(400).json({
        error: "Participant has already won",
        alreadyWon: true,
        prize: existingWinner.prize,
        drawDate: existingWinner.drawDate,
      });
    }

    const prizeLimit = PRIZE_LIMITS[prize];
    if (!prizeLimit) {
      return res.status(400).json({ error: "Invalid prize amount" });
    }

    const prizeCount = await Winner.count({ where: { prize: prize } });
    if (prizeCount >= prizeLimit) {
      const remainingCounts = {};
      for (const [prizeAmount, limit] of Object.entries(PRIZE_LIMITS)) {
        const count = await Winner.count({
          where: { prize: parseInt(prizeAmount) },
        });
        remainingCounts[`${prizeAmount}DB`] = limit - count;
      }

      return res.status(400).json({
        error: `Maximum limit reached for ${prize} Dinar prizes`,
        maxLimitReached: true,
        currentCount: prizeCount,
        limit: prizeLimit,
        remainingPrizes: remainingCounts,
      });
    }

    const winner = await Winner.create({
      phone: member.phone,
      name: member.name,
      prize: prize,
    });

    const remainingCounts = {};
    for (const [prizeAmount, limit] of Object.entries(PRIZE_LIMITS)) {
      const count = await Winner.count({
        where: { prize: parseInt(prizeAmount) },
      });
      remainingCounts[`${prizeAmount}DB`] = limit - count;
    }

    res.json({
      success: true,
      prize: winner.prize,
      drawDate: winner.drawDate,
      remainingPrizes: remainingCounts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/winners", async (req, res) => {
  try {
    const winners = await Winner.findAll({
      order: [["drawDate", "DESC"]],
    });

    const remainingCounts = {};
    for (const [prizeAmount, limit] of Object.entries(PRIZE_LIMITS)) {
      const count = await Winner.count({
        where: { prize: parseInt(prizeAmount) },
      });
      remainingCounts[`${prizeAmount}DB`] = limit - count;
    }

    console.log(
      "Winners retrieved:",
      winners.length,
      "Remaining prizes:",
      remainingCounts
    );
    res.json(winners);
  } catch (err) {
    console.error("Error retrieving winners:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/winners", adminAuth, async (req, res) => {
  try {
    const deletedCount = await Winner.destroy({ where: {} });

    console.log(`Deleted ${deletedCount} winners.`);
    res.json({ success: true, message: `Deleted ${deletedCount} winners.` });
  } catch (err) {
    console.error("Error deleting winners:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/export/excel", adminAuth, async (req, res) => {
  try {
    const winners = await Winner.findAll({
      order: [["drawDate", "DESC"]],
    });

    const data = winners.map((w) => ({
      ID: w.phone,
      Name: w.name,
      Prize: w.prize,
      "Draw Date": new Date(w.drawDate).toLocaleString(),
    }));

    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Winners");

    ws["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 20 }];

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=members.xlsx");

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting winners:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/export/json", adminAuth, async (req, res) => {
  try {
    const winners = await Winner.findAll({
      order: [["drawDate", "DESC"]],
    });

    let jsContent = "var member = [\n";

    const formattedMembers = winners
      .map((member) => {
        return `  {\n    "phone": "${member.phone}",\n    "name": "${member.name}"\n  }`;
      })
      .join(",\n");

    jsContent += formattedMembers;
    jsContent += "\n]";

    console.log("Generated member.js content:", jsContent);

    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Content-Disposition", "attachment; filename=member.js");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.send(jsContent);
  } catch (err) {
    console.error("Error exporting members:", err);
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  try {
    await sequelize.sync({ alter: true });
    console.log("Database synchronized successfully");

    app.listen(3000, async () => {
      console.log("Server is running on port 3000");
    });
  } catch (err) {
    console.error("Error starting the server:", err);
    process.exit(1);
  }
}

startServer();
