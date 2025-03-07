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
    console.log("التحقق من المشارك برقم:", participantId);

    const count = await Member.count();
    console.log("إجمالي الأعضاء في قاعدة البيانات:", count);

    if (count === 0) {
      console.log("لم يتم العثور على أعضاء في قاعدة البيانات");
      return res.json({ found: false, error: "قاعدة البيانات فارغة" });
    }

    const member = await Member.findOne({ where: { phone: participantId } });
    console.log("تم العثور على العضو:", member);

    if (member) {
      const winner = await Winner.findOne({ where: { phone: participantId } });
      console.log("حالة الفائز:", winner ? "فاز" : "لم يفز");

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
    console.error("خطأ في التحقق من المشارك:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/draw-prize", async (req, res) => {
  try {
    const { participantId, prize } = req.body;

    const member = await Member.findOne({ where: { phone: participantId } });
    if (!member) {
      return res.status(404).json({ error: "لم يتم العثور على المشارك" });
    }

    const existingWinner = await Winner.findOne({
      where: { phone: participantId },
    });
    if (existingWinner) {
      return res.status(400).json({
        error: "المشارك فاز بالفعل",
        alreadyWon: true,
        prize: existingWinner.prize,
        drawDate: existingWinner.drawDate,
      });
    }

    const prizeLimit = PRIZE_LIMITS[prize];
    if (!prizeLimit) {
      return res.status(400).json({ error: "قيمة الجائزة غير صالحة" });
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
        error: `تم الوصول إلى الحد الأقصى لجوائز ${prize} دينار`,
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

    console.log("تم حفظ الفائز الجديد:", {
      id: winner.id,
      phone: winner.phone,
      name: winner.name,
      prize: winner.prize,
      drawDate: winner.drawDate,
      remainingPrizes: remainingCounts,
    });

    res.json({
      success: true,
      prize: winner.prize,
      drawDate: winner.drawDate,
      remainingPrizes: remainingCounts,
    });
  } catch (err) {
    console.error("خطأ في سحب الجائزة:", err);
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
      "تم استرجاع الفائزين:",
      winners.length,
      "الجوائز المتبقية:",
      remainingCounts
    );
    res.json(winners);
  } catch (err) {
    console.error("خطأ في الحصول على الفائزين:", err);
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
    console.error("خطأ في تصدير الفائزين:", err);
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

    console.log("تم إنشاء محتوى members.js:", jsContent);

    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Content-Disposition", "attachment; filename=members.js");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.send(jsContent);
  } catch (err) {
    console.error("خطأ في تصدير الأعضاء:", err);
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  try {
    await sequelize.sync({ alter: true });
    console.log("تم مزامنة قاعدة البيانات بنجاح");

    app.listen(3000, async () => {
      console.log("الخادم يعمل على المنفذ 3000");
    });
  } catch (err) {
    console.error("خطأ في بدء الخادم:", err);
    process.exit(1);
  }
}

startServer();
