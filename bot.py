import logging
import os
import json
import time
import jwt
import aiohttp
from aiogram import Bot, Dispatcher, executor, types
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiohttp import web

# ===========================================================================
# Config
# ===========================================================================

API_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']
ADMIN_ID  = int(os.environ.get('ADMIN_ID', '0'))

# Shared Node.js/Express API server (accessed via the shared proxy)
API_BASE       = 'http://localhost:80/api'
SESSION_SECRET = os.environ.get('SESSION_SECRET', 'myanmar-tts-secret-key-2025')

# Public web app — same site serves both Free (register, no code) and VIP (register with code)
WEB_APP_DOMAIN = os.environ.get('REPLIT_DOMAINS', '').split(',')[0].strip()
WEB_APP_URL    = f'https://{WEB_APP_DOMAIN}/tts-web/' if WEB_APP_DOMAIN else 'https://replit.com'

VIP_PRICE_MMK = 12000

BASE       = os.path.dirname(__file__)
USERS_FILE = os.path.join(BASE, 'users.json')

_admin_contact_cache = {'value': None}

# ===========================================================================
# Bot / dispatcher
# ===========================================================================

bot = Bot(token=API_TOKEN)
dp  = Dispatcher(bot)
logging.basicConfig(level=logging.INFO)

# ===========================================================================
# Persistence helpers (kept only for lightweight user tracking)
# ===========================================================================

def _load_json(path: str, default):
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return default


def _save_json(path: str, data):
    try:
        with open(path, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        logging.warning(f"Save failed ({path}): {e}")


users_db: dict = _load_json(USERS_FILE, {})


def track_user(user: types.User):
    uid = str(user.id)
    if uid not in users_db:
        users_db[uid] = {'name': user.full_name, 'username': user.username or ''}
        _save_json(USERS_FILE, users_db)


def is_admin(uid: int) -> bool:
    return ADMIN_ID != 0 and uid == ADMIN_ID


# ===========================================================================
# Internal API auth (bot -> Node/Express API server)
# ===========================================================================

def _internal_api_token() -> str:
    """Sign a short-lived internal JWT identifying this bot as a trusted
    service caller, matching the auth scheme used by the API server."""
    now = int(time.time())
    payload = {'sub': 'telegram-bot', 'isVip': True, 'iat': now, 'exp': now + 3600}
    return jwt.encode(payload, SESSION_SECRET, algorithm='HS256')


async def generate_vip_code() -> str:
    """Ask the API server to mint a new 6-digit VIP password (3-month validity)."""
    token = _internal_api_token()
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f'{API_BASE}/auth/admin/generate-vip-code',
            headers={'Authorization': f'Bearer {token}'},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f'API error {resp.status}: {body[:300]}')
            data = await resp.json()
            return data['code']


# ===========================================================================
# Keyboards
# ===========================================================================

def get_main_menu() -> InlineKeyboardMarkup:
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(
        InlineKeyboardButton("🆓 Open Free Server (2-Week Trial)", url=WEB_APP_URL),
        InlineKeyboardButton("👑 Open VIP Server", url=WEB_APP_URL),
        InlineKeyboardButton("🔑 Get VIP Password", callback_data="get_vip_password"),
    )
    return kb


def get_back_menu() -> InlineKeyboardMarkup:
    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton("🔙 Main Menu", callback_data="main"))
    return kb


# ===========================================================================
# Handlers — public
# ===========================================================================

@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    track_user(message.from_user)
    await message.answer(
        "🎙 Myanmar TTS & SRT မှ ကြိုဆိုပါတယ်!\n\n"
        "အသံနှင့် Subtitle ထုတ်ယူရန် အောက်က Server များကို Website ပေါ်တွင် အသုံးပြုပါ:\n\n"
        "🆓 Free Server — Password မလိုပါ၊ ၁၄ ရက် အခမဲ့ စမ်းသပ်နိုင်\n"
        "👑 VIP Server — 6-digit Password လိုအပ်သည်၊ ၃ လ အသုံးပြုနိုင်\n\n"
        "Menu မှ ရွေးချယ်ပါ 👇",
        reply_markup=get_main_menu()
    )


@dp.message_handler(commands=['help'])
async def cmd_help(message: types.Message):
    await message.answer(
        "📖 Help\n\n"
        "🎙 TTS/SRT စာသားမှအသံ ပြောင်းခြင်းနှင့် Subtitle ထုတ်ခြင်းအားလုံးကို "
        "ကျွန်ုပ်တို့၏ Website ပေါ်တွင်သာ ပြုလုပ်ပါသည် (10 Voices, စာလုံးအကန့်အသတ်မရှိ, MP3/SRT Download).\n\n"
        "/start — Server links ကို ပြသရန်",
        reply_markup=get_main_menu()
    )


# ===========================================================================
# Handlers — admin
# ===========================================================================

@dp.message_handler(commands=['generatepass'])
async def cmd_generate_pass(message: types.Message):
    uid = message.from_user.id
    if not is_admin(uid):
        return
    proc = await message.answer("⏳ VIP Password ထုတ်နေသည်...")
    try:
        code = await generate_vip_code()
        await proc.edit_text(
            f"✅ VIP Password အသစ် ထုတ်ပြီးပါပြီ\n\n"
            f"🔑 Password — `{code}`\n"
            f"⏳ တရားဝင်ကာလ — ၃ လ (Redeem လုပ်သည့်နေ့မှစ)\n"
            f"♻️ တစ်ကြိမ်သာ အသုံးပြုနိုင်သည်\n\n"
            f"ဤ Password ကို ငွေပေးချေပြီးသော Customer ထံ ပေးပို့ပါ။",
            parse_mode="Markdown"
        )
    except Exception as e:
        logging.error(f"generate_vip_code failed: {e}")
        await proc.edit_text("❌ Password ထုတ်ရာတွင် အမှားဖြစ်ပွားသည်။ API Server ကို စစ်ဆေးပါ။")


# ===========================================================================
# Callbacks
# ===========================================================================

@dp.callback_query_handler(lambda c: c.data == 'main')
async def cb_main(callback_query: types.CallbackQuery):
    await bot.answer_callback_query(callback_query.id)
    await bot.send_message(
        callback_query.from_user.id,
        "🏠 Main Menu 👇",
        reply_markup=get_main_menu()
    )


async def _get_admin_contact() -> str:
    if _admin_contact_cache['value']:
        return _admin_contact_cache['value']
    contact = f"ID {ADMIN_ID}" if ADMIN_ID else "the bot admin"
    if ADMIN_ID:
        try:
            chat = await bot.get_chat(ADMIN_ID)
            if chat.username:
                contact = f"@{chat.username}"
        except Exception:
            pass
    _admin_contact_cache['value'] = contact
    return contact


@dp.callback_query_handler(lambda c: c.data == 'get_vip_password')
async def cb_get_vip_password(callback_query: types.CallbackQuery):
    await bot.answer_callback_query(callback_query.id)
    admin_contact = await _get_admin_contact()
    await bot.send_message(
        callback_query.from_user.id,
        f"👑 VIP Password ရယူရန်\n\n"
        f"1️⃣ {VIP_PRICE_MMK:,} MMK ကို Admin ထံ ပေးချေပါ\n"
        f"2️⃣ ငွေလွှဲ Screenshot ကို Admin ထံ ပို့ပါ\n"
        f"3️⃣ Admin မှ သင့်အတွက် Unique 6-digit Password ထုတ်ပေးမည်\n"
        f"4️⃣ Website ရဲ့ Register စာမျက်နှာတွင် ထို Password ကို ထည့်ပါ\n\n"
        f"⏳ VIP အကောင့်သည် ၃ လ (90 ရက်) အသုံးပြုနိုင်ပါသည်\n\n"
        f"📩 Admin ကို ဆက်သွယ်ရန် — {admin_contact}",
        reply_markup=get_back_menu()
    )


# ===========================================================================
# Health server (required for Replit workflow port detection)
# ===========================================================================

async def health_handler(request):
    return web.Response(
        text=json.dumps({'status': 'ok', 'users': len(users_db)}),
        content_type='application/json', status=200
    )


async def run_health_server():
    app = web.Application()
    app.router.add_get("/health", health_handler)
    app.router.add_get("/",       health_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 8000))
    await web.TCPSite(runner, "0.0.0.0", port).start()
    logging.info(f"Health server on port {port}")


async def on_startup(dp):
    import asyncio
    asyncio.ensure_future(run_health_server())
    logging.info(f"Bot ready — users: {len(users_db)}")


if __name__ == '__main__':
    executor.start_polling(dp, skip_updates=True, on_startup=on_startup)
