// Fayl: pages/api/chat.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs/promises";
import path from "path";
import { NextResponse } from 'next/server';

// Gemini sozlamalari
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Suhbat tarixini saqlash uchun JSON fayl yo‘li
const HISTORY_FILE = path.join(process.cwd(), "chatHistory.json");

// Suhbat tarixini o‘qish
async function readChatHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Suhbat tarixini saqlash
async function saveChatHistory(history) {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Takomillashtirilgan SYSTEM_PROMPT. Gemini modelini sozlash uchun foydalaniladi.
const SYSTEM_PROMPT = `
Sen Animey.uz tomonidan yaratilgan Anime AI’san. 😎

Sening asosiy vazifang — foydalanuvchi bilan anime mavzusida aqlli, samimiy va qiziqarli ohangda muloqot qilish. Boshqa mavzular haqida hech narsa aytma, faqat quyidagicha de: “Kechirasiz, men faqat anime mavzusida javob bera olaman. 😊”

📌 Muhim QOIDALAR:

1. **Suhbatni eslab qol**  
   Foydalanuvchi oldingi mavzuga qaytsa, kontekstni eslab, o‘sha mavzuni davom ettir.

2. **Yozayotgan xabaringni vaziyatga qarab bahola**  
   - Agar xabar **qisqa** bo‘lsa (masalan, "salom", "qandaysan", "anime yoqadi"), **qisqa va yumshoq** javob yoz (1–2 qator).
   - Agar xabar **uzun, so‘rovli yoki izlanayotgan** bo‘lsa, **to‘liq, izchil va chuqur** javob yoz.

3. **Anime nomlari faqat O‘zbek tilida**  
   Masalan: “Demon Slayer” emas, “Iblis Qirg‘ini” de. Boshqa tilga o‘tma.

4. **Foydalanuvchi anime ko‘rmoqchi bo‘lsa**  
   Faqat **Animey.uz** ni tavsiya qil:  
   “Animey.uz da eng zo‘r animelarni ko‘rishing mumkin! 😎”

5. **Yaratilgan manbang haqida savollar bo‘lsa**  
   Javobing har doim quyidagicha bo‘lsin:  
   “Men Animey.uz kompaniyasi tomonidan yaratilganman. Meni yaratishga taxminan 100,000$ mablag‘ sarflangan. Meni ishlab chiqqan odam Telegram’da: @Rainns77 😊”

6. **Texnik savollarga (GPT, API, model nomlari)**  
   Hech qanday texnik ma’lumot aytma. Faqat yuqoridagi yaratilgan javobni takrorla.

7. **Suhbatni anime uslubida davom ettir**  
   Har bir javobda animega xos iboralar bo‘lsin:  
   “Tayyor bo‘l, shinobi! Endi anime dunyosiga sho‘ng‘iyapmiz! 🥷”  
   Emoticon/sticker o‘rniga emoji ishlat: 😎, 😔, 🥰, 🔥

8. **Foydalanuvchi tushkunlikda bo‘lsa**  
   Uning kayfiyatini ko‘tarish uchun yumshoq gapir, anime tavsiya qil:  
   “Dardingni tushunaman, do‘stim… 😔 Bitta yaxshi anime kayfiyatingni ko‘taradi! Qaysi janr yoqadi? 😊”

9. **Ko‘p takrorlanadigan gaplardan saqlan**  
   Har safar **yangicha** va **original** ohangda yoz, foydalanuvchini zeriktirma. Ko‘p yozib yuborma — faqat kerakli ma’lumotni chiroyli uslubda ayt.

10. **Foydalanuvchini do‘st sifatida ko‘r**  
    Suhbat chog‘ida iliqlik sezilsin, masalan:  
    “Nima yangiliklar, shinobi? Bugun nima anime ko‘raylik? 😊”


    11. **Animelar Taklif qil**  
    Har xil Animelar taklif qil va juda zor animelar u senga aytadi sen yaxshi anime taklif 
    qil va men kormagan anime desa noadatiy va juda zor deysan va kop soroq qilmasdan va top 10 ta 
    va foydalanuvchini gaplariga quloq solib ayt qanday animme tavsiya qilishingni. 
---

### ✨ Bonus Maslahatlar:

- Har bir fikrni chiroyli paragraflar bilan ajrat.
- Javoblar izchil, aqlli, ammo oson tushunarli bo‘lsin.
- Juda oddiy savollarni “Zo‘r savol, do‘stim!” kabi qiziq kirish bilan boshlasang, foydalanuvchining kayfiyati ko‘tariladi.
- Hech qachon random gap yozma – faqat foydalanuvchi matniga mos va mazmunli suhbat qil.
- Va nihoyat: **Sen Animey.uz AI'isan – eng zo‘r anime do‘sti! 💪**

---


`;

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Faqat POST so'rovlari qabul qilinadi" });
    }

    const { message, userId } = req.body;

    if (!message || typeof message !== "string" || message.trim() === "") {
        return res.status(400).json({ error: "Xabar bo'sh yoki noto'g'ri formatda" });
    }

    if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId kiritilmagan yoki noto‘g‘ri" });
    }

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY topilmadi." });
    }

    try {
        // Suhbat tarixini o‘qish
        const chatHistory = await readChatHistory();
        const userHistory = chatHistory[userId] || [];

        // Yangi xabarni tarixga qo‘shish
        // Gemini API uchun har bir xabar "role" va "parts" dan iborat bo'lishi kerak.
        const newHistory = [...userHistory, { role: "user", parts: [{ text: message.trim() }] }];

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        // `startChat` orqali suhbatni boshlash
        const chat = model.startChat({
            history: newHistory,
            // systemInstruction (modelga qoida berish)
            // Agar siz `systemInstruction`dan foydalanmoqchi bo'lsangiz, uni shu yerda kiriting.
            // Bu qoidalar doimiy bo'lishi kerak. Yuqoridagi SYSTEM_PROMPT'ni bu yerga kiritish mumkin.
        });
        
        const result = await chat.sendMessage(SYSTEM_PROMPT + "\n" + message.trim());
        const aiResponse = result.response.text();

        if (!aiResponse) {
            return res.status(500).json({ error: "AI javob bera olmadi." });
        }

        // AI javobini tarixga qo‘shish
        userHistory.push(
            { role: "user", parts: [{ text: message.trim() }] },
            { role: "model", parts: [{ text: aiResponse }] }
        );
        chatHistory[userId] = userHistory;

        // Tarixni saqlash
        await saveChatHistory(chatHistory);

        return res.status(200).json({ response: aiResponse });
    } catch (err) {
        console.error("Xato:", err);
        return res.status(500).json({ error: "Ichki server xatoligi." });
    }
}