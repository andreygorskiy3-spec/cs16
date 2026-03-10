# CS 1.6 Browser Clone — de_dust2

Браузерный мультиплеер шутер, вдохновлённый Counter-Strike 1.6.  
Карта de_dust2, FPS от первого лица, до 6 игроков в команде, боты с AI.

## 🎮 Управление

| Клавиша | Действие |
|---------|----------|
| WASD | Движение |
| Мышь | Прицеливание |
| ЛКМ | Выстрел |
| R | Перезарядка |
| B | Меню покупки (во время заморозки) |
| F | Заложить бомбу (T) / Обезвредить (CT) |
| Tab | Таблица игроков |
| O | Меню ботов |
| T | Чат |
| 1/2/3 | Смена оружия |

## 🚀 Запуск локально

```bash
npm install
npm start
# Open http://localhost:3000
```

## 📦 Deploy на GitHub + Render.com

### 1. Загрузить на GitHub

```bash
git init
git add .
git commit -m "Initial commit: CS 1.6 Browser Clone"
git remote add origin https://github.com/YOUR_USERNAME/cs16-browser.git
git push -u origin main
```

### 2. Deploy на Render.com (бесплатно)

1. Зайди на https://render.com и зарегистрируйся
2. Нажми **"New"** → **"Web Service"**
3. Подключи GitHub репозиторий
4. Заполни настройки:
   - **Name:** cs16-browser
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Нажми **"Create Web Service"**
6. Через 2-3 минуты игра будет доступна по ссылке вида: `https://cs16-browser.onrender.com`

### 3. Играть с друзьями

Просто поделись ссылкой с Render.com — и все могут зайти без установки!

## 🏗️ Технологии

- **Сервер:** Node.js + Express + Socket.io
- **Клиент:** Three.js (3D), Socket.io-client
- **Физика:** Простая AABB коллизия + гравитация
- **Карта:** de_dust2 в Three.js геометрии

## 🤖 Боты

- Нажми **O** для открытия меню ботов
- До 6 ботов в каждой команде
- Боты ходят по карте и стреляют в противников

## 💰 Оружие

| Оружие | Цена | Урон | Команда |
|--------|------|------|---------|
| AK-47 | $2500 | 35 | T |
| M4A1 | $3100 | 32 | CT |
| AWP | $4750 | 115 | Любая |
| Desert Eagle | $650 | 53 | Любая |
| MP5 | $1500 | 27 | Любая |
| HE Граната | $300 | 98 | Любая |
