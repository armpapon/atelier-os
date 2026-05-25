# Atelier OS

Personal Life Dashboard — Trading Journal · Learning Hub · Daily Journal · Finance · Family

Built with **React 18 + Vite**. Designed to deploy on **Vercel** with **Supabase** as the backend.

---

## 🏃 Local development

```bash
cd atelier-os
npm install
npm run dev
```

เปิด http://localhost:5173

## 🏗️ Build for production

```bash
npm run build       # outputs to dist/
npm run preview     # serve dist/ locally for sanity check
```

---

## 🚀 Deploy to Vercel (ฟรี)

### ครั้งแรก
1. Push โค้ดขึ้น GitHub:
   ```bash
   cd atelier-os
   git init
   git add .
   git commit -m "init atelier-os"
   git branch -M main
   git remote add origin https://github.com/<your-username>/atelier-os.git
   git push -u origin main
   ```

2. ไปที่ https://vercel.com/new → Import repository
3. Vercel จะ detect Vite อัตโนมัติ — กด **Deploy** ได้เลย
4. ได้ URL `https://atelier-os-xxx.vercel.app` ใน ~1 นาที

### ครั้งต่อไป
แค่ `git push` — Vercel auto-deploy

---

## 🗄️ เชื่อม Supabase (ฟรี)

### 1. สร้าง Supabase project
1. ไปที่ https://supabase.com → New project (เลือก region `Southeast Asia (Singapore)`)
2. ตั้ง password ของ database
3. รอ ~2 นาที

### 2. รัน schema
เปิด **SQL Editor** ใน Supabase แล้ว paste schema จาก `supabase/schema.sql` (จะสร้างให้ใน step ถัดไป)

### 3. เพิ่ม env vars
สร้างไฟล์ `.env.local`:
```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

หาค่าได้จาก Supabase → Project Settings → API

### 4. ติดตั้ง client
```bash
npm install @supabase/supabase-js
```

### 5. Add Supabase integration to Vercel
- Vercel Dashboard → Project → Storage → Browse Marketplace → Supabase
- เชื่อม project — env vars จะ sync อัตโนมัติ

---

## 📁 Project structure

```
atelier-os/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx           # Entry point
    ├── App.jsx            # Routing + global state
    ├── styles.css         # Design tokens + all CSS
    ├── data.js            # Mock data (will be replaced by Supabase)
    ├── lib/
    │   └── helpers.js     # toneColor, thumbBg
    ├── components/
    │   ├── Icon.jsx
    │   ├── Sidebar.jsx
    │   ├── PageHeader.jsx
    │   ├── Sparkline.jsx
    │   ├── CandleChart.jsx
    │   ├── TweaksPanel.jsx
    │   └── ComingSoon.jsx
    └── pages/
        ├── Dashboard.jsx
        ├── Trading.jsx
        ├── Learning.jsx
        ├── Journal.jsx
        ├── Finance.jsx
        └── Family.jsx
```

## 🛣️ Roadmap

- [x] UI prototype with mock data
- [ ] Supabase schema + RLS policies
- [ ] Auth (email + Google)
- [ ] Trading module — CRUD against Supabase
- [ ] Finance module — CRUD + monthly rollups
- [ ] Journal module — daily bullet logging
- [ ] Learning, Family modules
- [ ] Goals & Second Brain (placeholders)
