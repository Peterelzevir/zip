//
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// =================== CONFIGURATION ===================
const BOT_TOKEN = '7559754047:AAEL93AChlINiJ7EDDppOQQwx3RxDC4BmVM'; // Ganti dengan token bot Anda
const ADMIN_IDS = [5988451717, 1290256714]; // Ganti dengan ID admin Anda
const ADMIN_USERNAME = '@ninz888'; // Username admin
const REQUIRED_CHANNEL = '@listprojec'; // Channel ID atau username
const REQUIRED_CHANNEL_ID = -1001864187252; // ID channel dalam format angka

// USDT Addresses
const USDT_ADDRESSES = {
    TRC20: 'TUGeTtQdrMVhHubtYo41fGAE1348oWzLu8',
    BEP20: '0x4f1834cD8e3293c48D3f2d217490d22dCd9BC7D3'
};

// Default Prices
const DEFAULT_PRICES = {
    groups: 7.5,
    channels: 2
};

// =================== SETUP ===================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Database Files
const DB_USERS = 'users.json';
const DB_PRODUCTS = 'products.json';
const DB_ORDERS = 'orders.json';
const DB_DEPOSITS = 'deposits.json';
const DB_SUPPORT = 'support.json';
const DB_ADMIN = 'admin.json';

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'id', 'zh', 'uz', 'ru'];

// Initialize databases
function initDatabase() {
    const databases = [
        { file: DB_USERS, default: {} },
        { file: DB_PRODUCTS, default: { 
            groups: { 
                2023: { 
                    january: { stock: 0, price: DEFAULT_PRICES.groups }, february: { stock: 0, price: DEFAULT_PRICES.groups }, march: { stock: 0, price: DEFAULT_PRICES.groups },
                    april: { stock: 0, price: DEFAULT_PRICES.groups }, may: { stock: 0, price: DEFAULT_PRICES.groups }, june: { stock: 0, price: DEFAULT_PRICES.groups },
                    july: { stock: 0, price: DEFAULT_PRICES.groups }, august: { stock: 0, price: DEFAULT_PRICES.groups }, september: { stock: 0, price: DEFAULT_PRICES.groups },
                    october: { stock: 0, price: DEFAULT_PRICES.groups }, november: { stock: 0, price: DEFAULT_PRICES.groups }, december: { stock: 0, price: DEFAULT_PRICES.groups }
                },
                2024: { 
                    january: { stock: 0, price: DEFAULT_PRICES.groups }, february: { stock: 0, price: DEFAULT_PRICES.groups }, march: { stock: 0, price: DEFAULT_PRICES.groups },
                    april: { stock: 0, price: DEFAULT_PRICES.groups }, may: { stock: 0, price: DEFAULT_PRICES.groups }, june: { stock: 0, price: DEFAULT_PRICES.groups },
                    july: { stock: 0, price: DEFAULT_PRICES.groups }, august: { stock: 0, price: DEFAULT_PRICES.groups }, september: { stock: 0, price: DEFAULT_PRICES.groups },
                    october: { stock: 0, price: DEFAULT_PRICES.groups }, november: { stock: 0, price: DEFAULT_PRICES.groups }, december: { stock: 0, price: DEFAULT_PRICES.groups }
                }
            }, 
            channels: {
                2022: { 
                    january: { stock: 0, price: DEFAULT_PRICES.channels }, february: { stock: 0, price: DEFAULT_PRICES.channels }, march: { stock: 0, price: DEFAULT_PRICES.channels },
                    april: { stock: 0, price: DEFAULT_PRICES.channels }, may: { stock: 0, price: DEFAULT_PRICES.channels }, june: { stock: 0, price: DEFAULT_PRICES.channels },
                    july: { stock: 0, price: DEFAULT_PRICES.channels }, august: { stock: 0, price: DEFAULT_PRICES.channels }, september: { stock: 0, price: DEFAULT_PRICES.channels },
                    october: { stock: 0, price: DEFAULT_PRICES.channels }, november: { stock: 0, price: DEFAULT_PRICES.channels }, december: { stock: 0, price: DEFAULT_PRICES.channels }
                },
                2023: { 
                    january: { stock: 0, price: DEFAULT_PRICES.channels }, february: { stock: 0, price: DEFAULT_PRICES.channels }, march: { stock: 0, price: DEFAULT_PRICES.channels },
                    april: { stock: 0, price: DEFAULT_PRICES.channels }, may: { stock: 0, price: DEFAULT_PRICES.channels }, june: { stock: 0, price: DEFAULT_PRICES.channels },
                    july: { stock: 0, price: DEFAULT_PRICES.channels }, august: { stock: 0, price: DEFAULT_PRICES.channels }, september: { stock: 0, price: DEFAULT_PRICES.channels },
                    october: { stock: 0, price: DEFAULT_PRICES.channels }, november: { stock: 0, price: DEFAULT_PRICES.channels }, december: { stock: 0, price: DEFAULT_PRICES.channels }
                }
            }
        } },
        { file: DB_ORDERS, default: {} },
        { file: DB_DEPOSITS, default: {} },
        { file: DB_SUPPORT, default: {} },
        { file: DB_ADMIN, default: { active_supports: {}, reply_mode: {} } }
    ];

    databases.forEach(db => {
        if (!fs.existsSync(db.file)) {
            fs.writeFileSync(db.file, JSON.stringify(db.default, null, 2));
        }
    });
}

// Database functions
function readDB(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        console.error(`Error reading ${file}:`, error);
        return {};
    }
}

function writeDB(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing ${file}:`, error);
    }
}

// Language translations
const translations = {
    en: {
        welcome: "🎉 Welcome to TeleMarket Bot!\n\nPlease select your language:",
        welcome_desc: "📈 Complete solution for Telegram business!\n📦 Groups, Channels ready accounts sale\n⚡ Fast | Reliable | Modern\n🔝 Reach the top with us!",
        main_menu: "🏠 You are in the main menu",
        wallet: "💳 Wallet",
        shop: "🛍️ Shop",
        ready_made: "✅ Ready-made accounts",
        settings: "⚙️ Settings",
        orders: "📋 Orders",
        statistics: "📊 Statistics",
        support: "💬 Support",
        guide: "📚 Guide",
        balance: "💰 Your balance:",
        your_orders: "📋 Your orders:",
        deposited: "📈 Deposited:",
        spent: "💸 Spent:",
        topup: "💵 USDT Top-up [Auto]",
        back: "🔙 Back",
        cancel: "❌ Cancel",
        confirm: "✅ Confirm",
        select_amount: "💰 Select amount to top-up:",
        custom_amount: "✏️ Custom Amount",
        min_amount: "⚠️ Minimum amount is 1 USDT",
        send_proof: "📸 Please send proof of transfer (1 photo):",
        wait_confirmation: "⏳ Please wait for admin confirmation",
        insufficient_funds: "❌ Insufficient funds. Please top up your wallet first.",
        select_type: "🛍️ You can purchase groups or channels through the Store section.\n\nSelect the Group or Channel section.\n\nSelect:",
        group: "👥 Group",
        channel: "📢 Channel",
        select_year: "📅 Select a year:",
        select_month: "📅 Select month:",
        enter_username: "👤 Please send the username(s) to transfer group ownership:",
        confirm_username: "✅ Can you confirm usernames?\n❗ - these username(s) are in the list of active orders, please wait for the previous order to complete.",
        group_price: "💰 Group price:",
        enter_count: "🔢 Enter the number of groups you would like to purchase:",
        total_users: "📊 Total users:",
        group_orders: "👥 Group orders:",
        update: "🔄 Update",
        no_orders: "🚫 No active orders found.",
        order_history: "📋 Order history",
        send_feedback: "💬 Please send your feedback or type /back to return to main menu.",
        join_channel: "⚠️ You must join our channel first to use this bot:",
        join_button: "📢 Join Channel",
        check_button: "✅ Check Membership",
        not_member: "❌ You are not a member of our channel yet. Please join first.",
        network_select: "🌐 Select USDT Network:",
        transfer_to: "💳 Transfer to address:",
        with_amount: "💰 Amount:",
        admin_ready_made: "✅ Ready-made accounts feature - Contact admin directly",
        contact_admin: "💬 Contact Admin",
        order_success: "✅ Order Successful!",
        order_details: "📦 Order Details:",
        order_id: "🆔 Order ID:",
        new_order: "🔔 New Order!",
        support_ended: "✅ Support session ended. Returning to main menu.",
        support_active: "💬 Support session active. Send your message or type /back to end session.",
        please_topup: "💰 Please top up your wallet first to continue shopping.",
        session_ended: "✅ Session ended. Returning to main menu.",
        months: {
            january: "January", february: "February", march: "March", april: "April",
            may: "May", june: "June", july: "July", august: "August", 
            september: "September", october: "October", november: "November", december: "December"
        },
        guide_text: `📚 Bot Usage Guide:

🔄 Order Cancellation:
Don't worry! Your funds will be automatically returned to your account.

⏰ Payment Processing Time:
Funds are automatically credited to your account within 5-10 seconds.

🚫 No Refunds!
Funds sent via the bot are non-refundable. Act correctly and precisely.

📧 Questions about your order?
If you have any issues or questions, please contact the admins.

⚠️ One service — an unlimited number of orders:
You can place an unlimited number of orders at the same time.

❗ For errors or issues: ${ADMIN_USERNAME}`,
        help_text: `🆘 Help - How to use the bot:

1️⃣ First, select your language
2️⃣ Join our required channel
3️⃣ Use /start to access the main menu
4️⃣ Top up your wallet with USDT
5️⃣ Purchase groups/channels from the Shop
6️⃣ Check your orders in Orders section
7️⃣ Contact Support if you need help

💡 All transactions are automatic and secure!`
    },
    id: {
        welcome: "🎉 Selamat datang di TeleMarket Bot!\n\nSilakan pilih bahasa Anda:",
        welcome_desc: "📈 Solusi lengkap untuk bisnis Telegram!\n📦 Grup, Channel akun siap pakai dijual\n⚡ Cepat | Terpercaya | Modern\n🔝 Raih puncak bersama kami!",
        main_menu: "🏠 Anda berada di menu utama",
        wallet: "💳 Dompet",
        shop: "🛍️ Toko",
        ready_made: "✅ Akun siap pakai",
        settings: "⚙️ Pengaturan",
        orders: "📋 Pesanan",
        statistics: "📊 Statistik",
        support: "💬 Dukungan",
        guide: "📚 Panduan",
        balance: "💰 Saldo Anda:",
        your_orders: "📋 Pesanan Anda:",
        deposited: "📈 Disetor:",
        spent: "💸 Dihabiskan:",
        topup: "💵 Top-up USDT [Otomatis]",
        back: "🔙 Kembali",
        cancel: "❌ Batal",
        confirm: "✅ Konfirmasi",
        select_amount: "💰 Pilih jumlah untuk top-up:",
        custom_amount: "✏️ Jumlah Kustom",
        min_amount: "⚠️ Jumlah minimum adalah 1 USDT",
        send_proof: "📸 Silakan kirim bukti transfer (1 foto):",
        wait_confirmation: "⏳ Silakan tunggu konfirmasi admin",
        insufficient_funds: "❌ Saldo tidak cukup. Silakan isi dompet Anda terlebih dahulu.",
        select_type: "🛍️ Anda dapat membeli grup atau channel melalui bagian Toko.\n\nPilih bagian Grup atau Channel.\n\nPilih:",
        group: "👥 Grup",
        channel: "📢 Channel",
        select_year: "📅 Pilih tahun:",
        select_month: "📅 Pilih bulan:",
        enter_username: "👤 Silakan kirim username untuk transfer kepemilikan grup:",
        confirm_username: "✅ Bisakah Anda konfirmasi username?\n❗ - username ini ada dalam daftar pesanan aktif, silakan tunggu pesanan sebelumnya selesai.",
        group_price: "💰 Harga grup:",
        enter_count: "🔢 Masukkan jumlah grup yang ingin Anda beli:",
        total_users: "📊 Total pengguna:",
        group_orders: "👥 Pesanan grup:",
        update: "🔄 Perbarui",
        no_orders: "🚫 Tidak ada pesanan aktif ditemukan.",
        order_history: "📋 Riwayat pesanan",
        send_feedback: "💬 Silakan kirim masukan Anda atau ketik /back untuk kembali ke menu utama.",
        join_channel: "⚠️ Anda harus bergabung dengan channel kami terlebih dahulu untuk menggunakan bot ini:",
        join_button: "📢 Bergabung ke Channel",
        check_button: "✅ Periksa Keanggotaan",
        not_member: "❌ Anda belum menjadi anggota channel kami. Silakan bergabung terlebih dahulu.",
        network_select: "🌐 Pilih Jaringan USDT:",
        transfer_to: "💳 Transfer ke alamat:",
        with_amount: "💰 Jumlah:",
        admin_ready_made: "✅ Fitur akun siap pakai - Hubungi admin langsung",
        contact_admin: "💬 Hubungi Admin",
        order_success: "✅ Pesanan Berhasil!",
        order_details: "📦 Detail Pesanan:",
        order_id: "🆔 ID Pesanan:",
        new_order: "🔔 Pesanan Baru!",
        support_ended: "✅ Sesi dukungan berakhir. Kembali ke menu utama.",
        support_active: "💬 Sesi dukungan aktif. Kirim pesan Anda atau ketik /back untuk mengakhiri sesi.",
        please_topup: "💰 Silakan isi dompet Anda terlebih dahulu untuk melanjutkan berbelanja.",
        session_ended: "✅ Sesi berakhir. Kembali ke menu utama.",
        months: {
            january: "Januari", february: "Februari", march: "Maret", april: "April",
            may: "Mei", june: "Juni", july: "Juli", august: "Agustus", 
            september: "September", october: "Oktober", november: "November", december: "Desember"
        },
        guide_text: `📚 Panduan Penggunaan Bot:

🔄 Pembatalan Pesanan:
Jangan khawatir! Dana Anda akan otomatis dikembalikan ke akun Anda.

⏰ Waktu Pemrosesan Pembayaran:
Dana otomatis dikreditkan ke akun Anda dalam 5-10 detik.

🚫 Tidak Ada Pengembalian Dana!
Dana yang dikirim melalui bot tidak dapat dikembalikan. Bertindaklah dengan benar dan tepat.

📧 Pertanyaan tentang pesanan Anda?
Jika Anda memiliki masalah atau pertanyaan, silakan hubungi admin.

⚠️ Satu layanan — jumlah pesanan tak terbatas:
Anda dapat melakukan pesanan dalam jumlah tak terbatas secara bersamaan.

❗ Untuk kesalahan atau masalah: ${ADMIN_USERNAME}`,
        help_text: `🆘 Bantuan - Cara menggunakan bot:

1️⃣ Pertama, pilih bahasa Anda
2️⃣ Bergabung dengan channel yang diperlukan
3️⃣ Gunakan /start untuk mengakses menu utama
4️⃣ Isi dompet Anda dengan USDT
5️⃣ Beli grup/channel dari Toko
6️⃣ Periksa pesanan Anda di bagian Pesanan
7️⃣ Hubungi Dukungan jika Anda membutuhkan bantuan

💡 Semua transaksi otomatis dan aman!`
    },
    zh: {
        welcome: "🎉 欢迎使用 TeleMarket Bot！\n\n请选择您的语言：",
        welcome_desc: "📈 Telegram 业务完整解决方案！\n📦 群组、频道现成账户销售\n⚡ 快速 | 可靠 | 现代\n🔝 与我们一起达到顶峰！",
        main_menu: "🏠 您在主菜单中",
        wallet: "💳 钱包",
        shop: "🛍️ 商店",
        ready_made: "✅ 现成账户",
        settings: "⚙️ 设置",
        orders: "📋 订单",
        statistics: "📊 统计",
        support: "💬 支持",
        guide: "📚 指南",
        balance: "💰 您的余额：",
        your_orders: "📋 您的订单：",
        deposited: "📈 已存入：",
        spent: "💸 已花费：",
        topup: "💵 USDT 充值 [自动]",
        back: "🔙 返回",
        cancel: "❌ 取消",
        confirm: "✅ 确认",
        select_amount: "💰 选择充值金额：",
        custom_amount: "✏️ 自定义金额",
        min_amount: "⚠️ 最低金额为 1 USDT",
        send_proof: "📸 请发送转账证明（1张照片）：",
        wait_confirmation: "⏳ 请等待管理员确认",
        insufficient_funds: "❌ 余额不足。请先充值您的钱包。",
        select_type: "🛍️ 您可以通过商店部分购买群组或频道。\n\n选择群组或频道部分。\n\n选择：",
        group: "👥 群组",
        channel: "📢 频道",
        select_year: "📅 选择年份：",
        select_month: "📅 选择月份：",
        enter_username: "👤 请发送用户名以转移群组所有权：",
        confirm_username: "✅ 您能确认用户名吗？\n❗ - 这些用户名在活动订单列表中，请等待上一个订单完成。",
        group_price: "💰 群组价格：",
        enter_count: "🔢 输入您想购买的群组数量：",
        total_users: "📊 总用户数：",
        group_orders: "👥 群组订单：",
        update: "🔄 更新",
        no_orders: "🚫 未找到活动订单。",
        order_history: "📋 订单历史",
        send_feedback: "💬 请发送您的反馈或输入 /back 返回主菜单。",
        join_channel: "⚠️ 您必须先加入我们的频道才能使用此机器人：",
        join_button: "📢 加入频道",
        check_button: "✅ 检查成员资格",
        not_member: "❌ 您还不是我们频道的成员。请先加入。",
        network_select: "🌐 选择 USDT 网络：",
        transfer_to: "💳 转账到地址：",
        with_amount: "💰 金额：",
        admin_ready_made: "✅ 现成账户功能 - 直接联系管理员",
        contact_admin: "💬 联系管理员",
        order_success: "✅ 订单成功！",
        order_details: "📦 订单详情：",
        order_id: "🆔 订单ID：",
        new_order: "🔔 新订单！",
        support_ended: "✅ 支持会话结束。返回主菜单。",
        support_active: "💬 支持会话活跃。发送您的消息或输入 /back 结束会话。",
        please_topup: "💰 请先充值您的钱包以继续购物。",
        session_ended: "✅ 会话结束。返回主菜单。",
        months: {
            january: "一月", february: "二月", march: "三月", april: "四月",
            may: "五月", june: "六月", july: "七月", august: "八月", 
            september: "九月", october: "十月", november: "十一月", december: "十二月"
        },
        guide_text: `📚 机器人使用指南：

🔄 订单取消：
不要担心！您的资金将自动返回到您的账户。

⏰ 付款处理时间：
资金会在5-10秒内自动存入您的账户。

🚫 不退款！
通过机器人发送的资金不可退款。请正确和精确地操作。

📧 关于您的订单有问题？
如果您有任何问题或疑问，请联系管理员。

⚠️ 一项服务 — 无限数量的订单：
您可以同时下无限数量的订单。

❗ 如有错误或问题：${ADMIN_USERNAME}`,
        help_text: `🆘 帮助 - 如何使用机器人：

1️⃣ 首先，选择您的语言
2️⃣ 加入我们的必需频道
3️⃣ 使用 /start 访问主菜单
4️⃣ 用 USDT 充值您的钱包
5️⃣ 从商店购买群组/频道
6️⃣ 在订单部分检查您的订单
7️⃣ 如果需要帮助，联系支持

💡 所有交易都是自动和安全的！`
    },
    uz: {
        welcome: "🎉 TeleMarket Bot'ga xush kelibsiz!\n\nIltimos, tilingizni tanlang:",
        welcome_desc: "📈 Telegram biznes uchun to'liq yechim!\n📦 Guruhlar, Kanallar tayyor akkauntlar sotiladi\n⚡ Tez | Ishonchli | Zamonaviy\n🔝 Biz bilan eng yuqoriga chiqing!",
        main_menu: "🏠 Siz asosiy menyudasiz",
        wallet: "💳 Hamyon",
        shop: "🛍️ Do'kon",
        ready_made: "✅ Tayyor akkauntlar",
        settings: "⚙️ Sozlamalar",
        orders: "📋 Buyurtmalar",
        statistics: "📊 Statistika",
        support: "💬 Qo'llab-quvvatlash",
        guide: "📚 Qo'llanma",
        balance: "💰 Sizning balansingiz:",
        your_orders: "📋 Sizning buyurtmalaringiz:",
        deposited: "📈 Kiritilgan:",
        spent: "💸 Sarflangan:",
        topup: "💵 USDT To'ldirish [Avtomatik]",
        back: "🔙 Orqaga",
        cancel: "❌ Bekor qilish",
        confirm: "✅ Tasdiqlash",
        select_amount: "💰 To'ldirish miqdorini tanlang:",
        custom_amount: "✏️ Maxsus miqdor",
        min_amount: "⚠️ Minimal miqdor 1 USDT",
        send_proof: "📸 Iltimos, o'tkazma dalilini yuboring (1 ta rasm):",
        wait_confirmation: "⏳ Iltimos, admin tasdiqlashini kuting",
        insufficient_funds: "❌ Mablag' yetarli emas. Iltimos, avval hamyoningizni to'ldiring.",
        select_type: "🛍️ Siz Do'kon bo'limidan guruhlar yoki kanallar sotib olishingiz mumkin.\n\nGuruh yoki Kanal bo'limini tanlang.\n\nTanlang:",
        group: "👥 Guruh",
        channel: "📢 Kanal",
        select_year: "📅 Yilni tanlang:",
        select_month: "📅 Oyni tanlang:",
        enter_username: "👤 Guruh egasini o'tkazish uchun foydalanuvchi nomini yuboring:",
        confirm_username: "✅ Foydalanuvchi nomini tasdiqlaysizmi?\n❗ - bu foydalanuvchi nomlari faol buyurtmalar ro'yxatida, oldingi buyurtma tugashini kuting.",
        group_price: "💰 Guruh narxi:",
        enter_count: "🔢 Sotib olmoqchi bo'lgan guruhlar sonini kiriting:",
        total_users: "📊 Jami foydalanuvchilar:",
        group_orders: "👥 Guruh buyurtmalari:",
        update: "🔄 Yangilash",
        no_orders: "🚫 Faol buyurtmalar topilmadi.",
        order_history: "📋 Buyurtmalar tarixi",
        send_feedback: "💬 Iltimos, fikr-mulohazangizni yuboring yoki asosiy menyuga qaytish uchun /back yozing.",
        join_channel: "⚠️ Ushbu botdan foydalanish uchun avval bizning kanalimizga qo'shilishingiz kerak:",
        join_button: "📢 Kanalga qo'shilish",
        check_button: "✅ A'zolikni tekshirish",
        not_member: "❌ Siz hali bizning kanal a'zosi emassiz. Iltimos, avval qo'shiling.",
        network_select: "🌐 USDT tarmog'ini tanlang:",
        transfer_to: "💳 Manzilga o'tkazish:",
        with_amount: "💰 Miqdor:",
        admin_ready_made: "✅ Tayyor akkauntlar xususiyati - Admin bilan bevosita bog'laning",
        contact_admin: "💬 Admin bilan bog'laning",
        order_success: "✅ Buyurtma muvaffaqiyatli!",
        order_details: "📦 Buyurtma tafsilotlari:",
        order_id: "🆔 Buyurtma ID:",
        new_order: "🔔 Yangi buyurtma!",
        support_ended: "✅ Yordam sessiyasi tugadi. Asosiy menyuga qaytish.",
        support_active: "💬 Yordam sessiyasi faol. Xabaringizni yuboring yoki sessiyani tugatish uchun /back yozing.",
        please_topup: "💰 Xarid qilishda davom etish uchun avval hamyoningizni to'ldiring.",
        session_ended: "✅ Sessiya tugadi. Asosiy menyuga qaytish.",
        months: {
            january: "Yanvar", february: "Fevral", march: "Mart", april: "Aprel",
            may: "May", june: "Iyun", july: "Iyul", august: "Avgust", 
            september: "Sentyabr", october: "Oktyabr", november: "Noyabr", december: "Dekabr"
        },
        guide_text: `📚 Bot foydalanish qo'llanmasi:

🔄 Buyurtmani bekor qilish:
Tashvishlanmang! Sizning mablag'ingiz avtomatik ravishda hisobingizga qaytariladi.

⏰ To'lov qayta ishlash vaqti:
Mablag'lar 5-10 soniya ichida avtomatik ravishda hisobingizga qo'shiladi.

🚫 Qaytarib berish yo'q!
Bot orqali yuborilgan mablag'lar qaytarib berilmaydi. To'g'ri va aniq harakat qiling.

📧 Buyurtmangiz haqida savollar?
Agar sizda muammolar yoki savollar bo'lsa, adminlar bilan bog'laning.

⚠️ Bitta xizmat — cheksiz buyurtmalar:
Siz bir vaqtning o'zida cheksiz miqdorda buyurtma berishingiz mumkin.

❗ Xatolar yoki muammolar uchun: ${ADMIN_USERNAME}`,
        help_text: `🆘 Yordam - Botdan qanday foydalanish:

1️⃣ Avval, tilingizni tanlang
2️⃣ Kerakli kanalimizga qo'shiling
3️⃣ Asosiy menyuga kirish uchun /start ni ishlating
4️⃣ Hamyoningizni USDT bilan to'ldiring
5️⃣ Do'kondan guruhlar/kanallar sotib oling
6️⃣ Buyurtmalar bo'limida buyurtmalaringizni tekshiring
7️⃣ Yordam kerak bo'lsa, Qo'llab-quvvatlash bilan bog'laning

💡 Barcha operatsiyalar avtomatik va xavfsiz!`
    },
    ru: {
        welcome: "🎉 Добро пожаловать в TeleMarket Bot!\n\nПожалуйста, выберите ваш язык:",
        welcome_desc: "📈 Полное решение для Telegram бизнеса!\n📦 Группы, Каналы готовые аккаунты на продажу\n⚡ Быстро | Надежно | Современно\n🔝 Достигните вершины с нами!",
        main_menu: "🏠 Вы находитесь в главном меню",
        wallet: "💳 Кошелек",
        shop: "🛍️ Магазин",
        ready_made: "✅ Готовые аккаунты",
        settings: "⚙️ Настройки",
        orders: "📋 Заказы",
        statistics: "📊 Статистика",
        support: "💬 Поддержка",
        guide: "📚 Руководство",
        balance: "💰 Ваш баланс:",
        your_orders: "📋 Ваши заказы:",
        deposited: "📈 Пополнено:",
        spent: "💸 Потрачено:",
        topup: "💵 Пополнение USDT [Авто]",
        back: "🔙 Назад",
        cancel: "❌ Отмена",
        confirm: "✅ Подтвердить",
        select_amount: "💰 Выберите сумму для пополнения:",
        custom_amount: "✏️ Своя сумма",
        min_amount: "⚠️ Минимальная сумма 1 USDT",
        send_proof: "📸 Пожалуйста, отправьте подтверждение перевода (1 фото):",
        wait_confirmation: "⏳ Пожалуйста, ждите подтверждения от администратора",
        insufficient_funds: "❌ Недостаточно средств. Пожалуйста, сначала пополните кошелек.",
        select_type: "🛍️ Вы можете купить группы или каналы через раздел Магазин.\n\nВыберите раздел Группы или Каналы.\n\nВыберите:",
        group: "👥 Группа",
        channel: "📢 Канал",
        select_year: "📅 Выберите год:",
        select_month: "📅 Выберите месяц:",
        enter_username: "👤 Пожалуйста, отправьте имя пользователя для передачи права владения группой:",
        confirm_username: "✅ Можете подтвердить имена пользователей?\n❗ - эти имена пользователей в списке активных заказов, пожалуйста, дождитесь завершения предыдущего заказа.",
        group_price: "💰 Цена группы:",
        enter_count: "🔢 Введите количество групп, которые хотите купить:",
        total_users: "📊 Всего пользователей:",
        group_orders: "👥 Заказы групп:",
        update: "🔄 Обновить",
        no_orders: "🚫 Активных заказов не найдено.",
        order_history: "📋 История заказов",
        send_feedback: "💬 Пожалуйста, отправьте ваш отзыв или введите /back для возврата в главное меню.",
        join_channel: "⚠️ Вы должны сначала присоединиться к нашему каналу, чтобы использовать этого бота:",
        join_button: "📢 Присоединиться к каналу",
        check_button: "✅ Проверить членство",
        not_member: "❌ Вы еще не являетесь участником нашего канала. Пожалуйста, сначала присоединитесь.",
        network_select: "🌐 Выберите сеть USDT:",
        transfer_to: "💳 Перевести на адрес:",
        with_amount: "💰 Сумма:",
        admin_ready_made: "✅ Функция готовых аккаунтов - Свяжитесь с администратором напрямую",
        contact_admin: "💬 Связаться с администратором",
        order_success: "✅ Заказ успешен!",
        order_details: "📦 Детали заказа:",
        order_id: "🆔 ID заказа:",
        new_order: "🔔 Новый заказ!",
        support_ended: "✅ Сессия поддержки завершена. Возврат в главное меню.",
        support_active: "💬 Сессия поддержки активна. Отправьте ваше сообщение или введите /back для завершения сессии.",
        please_topup: "💰 Пожалуйста, сначала пополните кошелек для продолжения покупок.",
        session_ended: "✅ Сессия завершена. Возврат в главное меню.",
        months: {
            january: "Январь", february: "Февраль", march: "Март", april: "Апрель",
            may: "Май", june: "Июнь", july: "Июль", august: "Август", 
            september: "Сентябрь", october: "Октябрь", november: "Ноябрь", december: "Декабрь"
        },
        guide_text: `📚 Руководство по использованию бота:

🔄 Отмена заказа:
Не волнуйтесь! Ваши средства будут автоматически возвращены на ваш счет.

⏰ Время обработки платежа:
Средства автоматически зачисляются на ваш счет в течение 5-10 секунд.

🚫 Без возврата!
Средства, отправленные через бота, не возвращаются. Действуйте правильно и точно.

📧 Вопросы о вашем заказе?
Если у вас есть проблемы или вопросы, пожалуйста, свяжитесь с администраторами.

⚠️ Одна услуга — неограниченное количество заказов:
Вы можете размещать неограниченное количество заказов одновременно.

❗ При ошибках или проблемах: ${ADMIN_USERNAME}`,
        help_text: `🆘 Помощь - Как использовать бота:

1️⃣ Сначала выберите ваш язык
2️⃣ Присоединитесь к нашему обязательному каналу
3️⃣ Используйте /start для доступа к главному меню
4️⃣ Пополните кошелек USDT
5️⃣ Покупайте группы/каналы в Магазине
6️⃣ Проверяйте заказы в разделе Заказы
7️⃣ Обращайтесь в Поддержку если нужна помощь

💡 Все транзакции автоматические и безопасные!`
    }
};

// Get text in user's language
function getText(userId, key) {
    const users = readDB(DB_USERS);
    const userLang = users[userId]?.language || 'en';
    
    if (!SUPPORTED_LANGUAGES.includes(userLang)) {
        return translations['en'][key] || key;
    }
    
    return translations[userLang][key] || translations['en'][key] || key;
}

// Get user data
function getUser(userId) {
    const users = readDB(DB_USERS);
    if (!users[userId]) {
        users[userId] = {
            id: userId,
            language: 'en',
            language_set: false,
            balance: 0,
            deposited: 0,
            spent: 0,
            orders: 0,
            joined: Date.now(),
            state: null
        };
        writeDB(DB_USERS, users);
    }
    return users[userId];
}

// Update user data
function updateUser(userId, data) {
    const users = readDB(DB_USERS);
    users[userId] = { ...users[userId], ...data };
    writeDB(DB_USERS, users);
}

// Clear user state
function clearUserState(userId) {
    updateUser(userId, { 
        state: null, 
        shop_type: null, 
        shop_year: null, 
        shop_month: null, 
        pending_username: null, 
        pending_deposit: null,
        selected_network: null
    });
}

// Check if user is admin
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

// Check if user is member of required channel
async function checkChannelMembership(userId) {
    try {
        const member = await bot.getChatMember(REQUIRED_CHANNEL_ID, userId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (error) {
        console.error('Error checking channel membership:', error);
        return false;
    }
}

// Generate language selection keyboard
function getLanguageKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🇺🇸 English', callback_data: 'lang_en' },
                    { text: '🇮🇩 Indonesia', callback_data: 'lang_id' }
                ],
                [
                    { text: '🇨🇳 中文', callback_data: 'lang_zh' },
                    { text: '🇺🇿 O\'zbek', callback_data: 'lang_uz' }
                ],
                [
                    { text: '🇷🇺 Русский', callback_data: 'lang_ru' }
                ]
            ]
        }
    };
}

// Generate main menu keyboard
function getMainMenuKeyboard(userId) {
    return {
        reply_markup: {
            keyboard: [
                [
                    { text: getText(userId, 'wallet') },
                    { text: getText(userId, 'shop') }
                ],
                [
                    { text: getText(userId, 'ready_made') },
                    { text: getText(userId, 'settings') }
                ],
                [
                    { text: getText(userId, 'orders') },
                    { text: getText(userId, 'statistics') }
                ],
                [
                    { text: getText(userId, 'support') },
                    { text: getText(userId, 'guide') }
                ]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

// Generate cancel keyboard
function getCancelKeyboard(userId) {
    return {
        reply_markup: {
            keyboard: [
                [{ text: getText(userId, 'back') }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

// Generate topup amount keyboard
function getTopupKeyboard(userId) {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1 USDT', callback_data: 'topup_1' },
                    { text: '10 USDT', callback_data: 'topup_10' }
                ],
                [
                    { text: '50 USDT', callback_data: 'topup_50' },
                    { text: '100 USDT', callback_data: 'topup_100' }
                ],
                [
                    { text: getText(userId, 'custom_amount'), callback_data: 'topup_custom' }
                ]
            ]
        }
    };
}

// Generate network selection keyboard
function getNetworkKeyboard(userId) {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'TRC20 (Tron)', callback_data: 'network_TRC20' },
                    { text: 'BEP20 (BSC)', callback_data: 'network_BEP20' }
                ]
            ]
        }
    };
}

// Generate year selection keyboard
function getYearKeyboard(type) {
    const products = readDB(DB_PRODUCTS);
    const years = Object.keys(products[type] || {});
    
    const keyboard = [];
    for (let i = 0; i < years.length; i += 2) {
        const row = [{ text: years[i], callback_data: `year_${years[i]}` }];
        if (years[i + 1]) {
            row.push({ text: years[i + 1], callback_data: `year_${years[i + 1]}` });
        }
        keyboard.push(row);
    }
    
    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

// Generate month selection keyboard
function getMonthKeyboard(userId, type, year) {
    const products = readDB(DB_PRODUCTS);
    const months = Object.keys(products[type][year] || {});
    const user = getUser(userId);
    
    const keyboard = [];
    const monthNames = translations[user.language]?.months || translations['en'].months;
    
    for (let i = 0; i < months.length; i += 2) {
        const row = [{
            text: `${monthNames[months[i]]} - ${products[type][year][months[i]].stock} pcs`,
            callback_data: `month_${months[i]}`
        }];
        if (months[i + 1]) {
            row.push({
                text: `${monthNames[months[i + 1]]} - ${products[type][year][months[i + 1]].stock} pcs`,
                callback_data: `month_${months[i + 1]}`
            });
        }
        keyboard.push(row);
    }
    
    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

// Get admin panel keyboard
function getAdminPanelKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📦 Manage Products', callback_data: 'admin_products' },
                    { text: '👥 Manage Users', callback_data: 'admin_users' }
                ],
                [
                    { text: '📊 Statistics', callback_data: 'admin_stats' },
                    { text: '📋 Orders', callback_data: 'admin_orders' }
                ],
                [
                    { text: '💰 Deposits', callback_data: 'admin_deposits' },
                    { text: '📢 Broadcast', callback_data: 'admin_broadcast' }
                ]
            ]
        }
    };
}

// Get product management keyboard
function getProductManagementKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📦 Add Stock', callback_data: 'admin_add_stock' },
                    { text: '💰 Set Price', callback_data: 'admin_set_price' }
                ],
                [
                    { text: '📅 Add Year', callback_data: 'admin_add_year' },
                    { text: '🗑 Remove Year', callback_data: 'admin_remove_year' }
                ],
                [
                    { text: '📋 View Products', callback_data: 'admin_view_products' },
                    { text: '🔙 Back', callback_data: 'admin_back' }
                ]
            ]
        }
    };
}

// Get statistics
function getStatistics() {
    const users = readDB(DB_USERS);
    const orders = readDB(DB_ORDERS);
    const products = readDB(DB_PRODUCTS);
    
    const totalUsers = Object.keys(users).length;
    let totalGroupOrders = 0;
    let totalChannelOrders = 0;
    
    Object.values(orders).forEach(order => {
        if (order.type === 'groups') {
            totalGroupOrders += order.quantity;
        } else if (order.type === 'channels') {
            totalChannelOrders += order.quantity;
        }
    });
    
    return {
        totalUsers,
        totalGroupOrders,
        totalChannelOrders,
        products
    };
}

// Format statistics message
function formatStatistics(userId) {
    const stats = getStatistics();
    const currentTime = new Date().toLocaleString();
    
    let message = `📊 ${getText(userId, 'total_users')} ${stats.totalUsers} pcs\n`;
    message += `👥 ${getText(userId, 'group_orders')} ${stats.totalGroupOrders} pcs\n\n`;
    
    // Groups statistics
    message += `—————— 2024 ——————\n`;
    message += `📅 Groups: ${stats.products.groups['2024'] ? Object.values(stats.products.groups['2024']).reduce((sum, month) => sum + month.stock, 0) : 0} pcs\n`;
    message += `💰 Price: ${stats.products.groups['2024'] ? stats.products.groups['2024'].january.price : DEFAULT_PRICES.groups} USDT\n\n`;
    
    // Channels statistics
    message += `—————— 2022 ——————\n`;
    message += `📅 Channels: ${stats.products.channels['2022'] ? Object.values(stats.products.channels['2022']).reduce((sum, month) => sum + month.stock, 0) : 0} pcs\n`;
    message += `💰 Price: ${stats.products.channels['2022'] ? stats.products.channels['2022'].january.price : DEFAULT_PRICES.channels} USDT\n\n`;
    
    message += `—————— 2023 ——————\n`;
    message += `📅 Channels: ${stats.products.channels['2023'] ? Object.values(stats.products.channels['2023']).reduce((sum, month) => sum + month.stock, 0) : 0} pcs\n`;
    message += `💰 Price: ${stats.products.channels['2023'] ? stats.products.channels['2023'].january.price : DEFAULT_PRICES.channels} USDT\n\n`;
    
    message += `🕒 Last updated: ${currentTime}`;
    
    return message;
}

// Send welcome message with description
async function sendWelcomeMessage(userId) {
    const user = getUser(userId);
    
    // Send description first
    await bot.sendMessage(userId, `❓ Apa yang dapat bot ini lakukan?\n\n${getText(userId, 'welcome_desc')}`);
    
    // Then send main menu
    setTimeout(() => {
        bot.sendMessage(userId, getText(userId, 'main_menu'), getMainMenuKeyboard(userId));
    }, 1000);
}

// Initialize database and start bot
initDatabase();

// Set commands
bot.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Get help' },
    { command: 'back', description: 'Go back/Cancel current action' },
    { command: 'admin', description: 'Admin panel (Admin only)' }
]);

// Handle /start command
bot.onText(/\/start/, async (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId);
    
    // Clear any active states
    clearUserState(userId);
    
    if (!user.language_set) {
        bot.sendMessage(userId, getText(userId, 'welcome'), getLanguageKeyboard());
        return;
    }
    
    try {
        const isMember = await checkChannelMembership(userId);
        if (!isMember) {
            bot.sendMessage(userId, getText(userId, 'join_channel'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: getText(userId, 'join_button'), url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }
                        ],
                        [
                            { text: getText(userId, 'check_button'), callback_data: 'check_membership' }
                        ]
                    ]
                }
            });
            return;
        }
        
        await sendWelcomeMessage(userId);
    } catch (error) {
        console.error('Error in /start command:', error);
        bot.sendMessage(userId, 'An error occurred. Please try again.');
    }
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
    const userId = msg.from.id;
    clearUserState(userId);
    bot.sendMessage(userId, getText(userId, 'help_text'));
});

// Handle /back command
bot.onText(/\/back/, (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId);
    
    // Clear user state
    clearUserState(userId);
    
    // Send appropriate message
    if (user.state === 'support_chat') {
        bot.sendMessage(userId, getText(userId, 'support_ended'), getMainMenuKeyboard(userId));
    } else {
        bot.sendMessage(userId, getText(userId, 'session_ended'), getMainMenuKeyboard(userId));
    }
});

// Admin Commands
bot.onText(/\/admin/, (msg) => {
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        bot.sendMessage(userId, '❌ You are not authorized to use admin commands.');
        return;
    }
    
    clearUserState(userId);
    
    bot.sendMessage(userId, '🔧 Admin Panel\n\nSelect an option:', getAdminPanelKeyboard());
});

// Handle callback queries
bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const data = query.data;
    const messageId = query.message.message_id;
    
    try {
        // Handle language selection
        if (data.startsWith('lang_')) {
            const lang = data.split('_')[1];
            
            if (!SUPPORTED_LANGUAGES.includes(lang)) {
                bot.answerCallbackQuery(query.id, { text: 'Invalid language selected', show_alert: true });
                return;
            }
            
            updateUser(userId, { language: lang, language_set: true });
            
            try {
                await bot.editMessageText(getText(userId, 'welcome'), {
                    chat_id: userId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Language Selected', callback_data: 'lang_selected' }]
                        ]
                    }
                });
            } catch (editError) {
                console.log('Could not edit message:', editError.message);
            }
            
            setTimeout(async () => {
                try {
                    await bot.deleteMessage(userId, messageId);
                } catch (e) {
                    console.log('Could not delete message:', e.message);
                }
                
                const isMember = await checkChannelMembership(userId);
                if (!isMember) {
                    bot.sendMessage(userId, getText(userId, 'join_channel'), {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: getText(userId, 'join_button'), url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }
                                ],
                                [
                                    { text: getText(userId, 'check_button'), callback_data: 'check_membership' }
                                ]
                            ]
                        }
                    });
                } else {
                    await sendWelcomeMessage(userId);
                }
            }, 2000);
            
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Check membership
        if (data === 'check_membership') {
            const isMember = await checkChannelMembership(userId);
            if (isMember) {
                try {
                    await bot.editMessageText(getText(userId, 'main_menu'), {
                        chat_id: userId,
                        message_id: messageId
                    });
                } catch (editError) {
                    console.log('Could not edit message:', editError.message);
                }
                setTimeout(async () => {
                    try {
                        await bot.deleteMessage(userId, messageId);
                    } catch (e) {
                        console.log('Could not delete message:', e.message);
                    }
                    await sendWelcomeMessage(userId);
                }, 1000);
            } else {
                bot.answerCallbackQuery(query.id, { text: getText(userId, 'not_member'), show_alert: true });
            }
            return;
        }
        
        // Handle topup button
        if (data === 'show_topup') {
            try {
                await bot.editMessageText(getText(userId, 'select_amount'), {
                    chat_id: userId,
                    message_id: messageId,
                    ...getTopupKeyboard(userId)
                });
            } catch (editError) {
                bot.sendMessage(userId, getText(userId, 'select_amount'), getTopupKeyboard(userId));
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle topup amounts
        if (data.startsWith('topup_')) {
            const amount = data.split('_')[1];
            
            if (amount === 'custom') {
                try {
                    await bot.editMessageText(getText(userId, 'custom_amount'), {
                        chat_id: userId,
                        message_id: messageId
                    });
                } catch (editError) {
                    bot.sendMessage(userId, getText(userId, 'custom_amount'));
                }
                updateUser(userId, { state: 'waiting_custom_amount' });
                bot.answerCallbackQuery(query.id);
                return;
            }
            
            const numAmount = parseInt(amount);
            if (numAmount >= 1) {
                updateUser(userId, { pending_deposit: numAmount });
                try {
                    await bot.editMessageText(getText(userId, 'network_select'), {
                        chat_id: userId,
                        message_id: messageId,
                        ...getNetworkKeyboard(userId)
                    });
                } catch (editError) {
                    bot.sendMessage(userId, getText(userId, 'network_select'), getNetworkKeyboard(userId));
                }
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle network selection
        if (data.startsWith('network_')) {
            const network = data.split('_')[1];
            const user = getUser(userId);
            const amount = user.pending_deposit;
            
            let message = `${getText(userId, 'transfer_to')} ${USDT_ADDRESSES[network]}\n\n`;
            message += `${getText(userId, 'with_amount')} ${amount} USDT\n\n`;
            message += getText(userId, 'send_proof');
            
            try {
                await bot.editMessageText(message, {
                    chat_id: userId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: getText(userId, 'confirm'), callback_data: 'confirm_transfer' }]
                        ]
                    }
                });
            } catch (editError) {
                bot.sendMessage(userId, message, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: getText(userId, 'confirm'), callback_data: 'confirm_transfer' }]
                        ]
                    }
                });
            }
            
            updateUser(userId, { state: 'waiting_transfer_proof', selected_network: network });
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle transfer confirmation
        if (data === 'confirm_transfer') {
            try {
                await bot.editMessageText(getText(userId, 'send_proof'), {
                    chat_id: userId,
                    message_id: messageId
                });
            } catch (editError) {
                bot.sendMessage(userId, getText(userId, 'send_proof'));
            }
            updateUser(userId, { state: 'waiting_transfer_proof' });
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle shop type selection
        if (data === 'shop_groups' || data === 'shop_channels') {
            const type = data.split('_')[1];
            updateUser(userId, { shop_type: type });
            
            try {
                await bot.editMessageText(getText(userId, 'select_year'), {
                    chat_id: userId,
                    message_id: messageId,
                    ...getYearKeyboard(type)
                });
            } catch (editError) {
                bot.sendMessage(userId, getText(userId, 'select_year'), getYearKeyboard(type));
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle year selection
        if (data.startsWith('year_')) {
            const year = data.split('_')[1];
            const user = getUser(userId);
            
            updateUser(userId, { shop_year: year });
            
            try {
                await bot.editMessageText(getText(userId, 'select_month'), {
                    chat_id: userId,
                    message_id: messageId,
                    ...getMonthKeyboard(userId, user.shop_type, year)
                });
            } catch (editError) {
                bot.sendMessage(userId, getText(userId, 'select_month'), getMonthKeyboard(userId, user.shop_type, year));
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle month selection
        if (data.startsWith('month_')) {
            const month = data.split('_')[1];
            const user = getUser(userId);
            
            updateUser(userId, { shop_month: month });
            
            try {
                await bot.editMessageText(getText(userId, 'enter_username'), {
                    chat_id: userId,
                    message_id: messageId
                });
            } catch (editError) {
                bot.sendMessage(userId, getText(userId, 'enter_username'));
            }
            
            updateUser(userId, { state: 'waiting_username' });
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle username confirmation
        if (data === 'confirm_username') {
            const user = getUser(userId);
            const products = readDB(DB_PRODUCTS);
            const product = products[user.shop_type][user.shop_year][user.shop_month];
            
            let message = `💰 ${getText(userId, 'group_price')} ${product.price} USDT\n\n`;
            message += getText(userId, 'enter_count');
            
            try {
                await bot.editMessageText(message, {
                    chat_id: userId,
                    message_id: messageId
                });
            } catch (editError) {
                bot.sendMessage(userId, message);
            }
            
            updateUser(userId, { state: 'waiting_quantity' });
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        if (data === 'cancel_username') {
            clearUserState(userId);
            try {
                await bot.editMessageText(getText(userId, 'main_menu'), {
                    chat_id: userId,
                    message_id: messageId
                });
            } catch (editError) {
                bot.sendMessage(userId, getText(userId, 'main_menu'), getMainMenuKeyboard(userId));
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle order history
        if (data === 'order_history') {
            const orders = readDB(DB_ORDERS);
            const userOrders = Object.values(orders).filter(order => order.userId === userId);
            
            if (userOrders.length === 0) {
                bot.answerCallbackQuery(query.id, { text: getText(userId, 'no_orders'), show_alert: true });
            } else {
                let message = `📋 ${getText(userId, 'order_history')}:\n\n`;
                userOrders.slice(-5).forEach(order => {
                    message += `🆔 ${order.id}\n`;
                    message += `📦 ${order.type} - ${order.year} - ${order.month}\n`;
                    message += `🔢 Quantity: ${order.quantity}\n`;
                    message += `💰 Total: ${order.total} USDT\n`;
                    message += `📅 ${new Date(order.created_at).toLocaleDateString()}\n\n`;
                });
                
                try {
                    await bot.editMessageText(message, {
                        chat_id: userId,
                        message_id: messageId
                    });
                } catch (editError) {
                    bot.sendMessage(userId, message);
                }
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle statistics update
        if (data === 'update_stats') {
            try {
                await bot.editMessageText(formatStatistics(userId), {
                    chat_id: userId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: getText(userId, 'update'), callback_data: 'update_stats' }]
                        ]
                    }
                });
            } catch (editError) {
                bot.sendMessage(userId, formatStatistics(userId), {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: getText(userId, 'update'), callback_data: 'update_stats' }]
                        ]
                    }
                });
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle deposit approval (admin only)
        if (data.startsWith('approve_deposit_') && isAdmin(userId)) {
            const depositId = data.split('_')[2];
            const deposits = readDB(DB_DEPOSITS);
            
            if (deposits[depositId]) {
                const deposit = deposits[depositId];
                const targetUser = getUser(deposit.userId);
                
                // Add balance to user
                updateUser(deposit.userId, { 
                    balance: targetUser.balance + deposit.amount,
                    deposited: targetUser.deposited + deposit.amount
                });
                
                // Mark deposit as approved
                deposits[depositId].status = 'approved';
                deposits[depositId].approved_at = Date.now();
                writeDB(DB_DEPOSITS, deposits);
                
                // Notify user
                bot.sendMessage(deposit.userId, `✅ Your deposit of ${deposit.amount} USDT has been approved!`);
                
                // Update admin message
                try {
                    await bot.editMessageText(`✅ Deposit approved!\n\nUser: ${deposit.userId}\nAmount: ${deposit.amount} USDT`, {
                        chat_id: userId,
                        message_id: messageId
                    });
                } catch (editError) {
                    console.log('Could not edit admin message:', editError.message);
                }
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle deposit rejection (admin only)
        if (data.startsWith('reject_deposit_') && isAdmin(userId)) {
            const depositId = data.split('_')[2];
            const deposits = readDB(DB_DEPOSITS);
            
            if (deposits[depositId]) {
                const deposit = deposits[depositId];
                
                // Mark deposit as rejected
                deposits[depositId].status = 'rejected';
                deposits[depositId].rejected_at = Date.now();
                writeDB(DB_DEPOSITS, deposits);
                
                // Notify user
                bot.sendMessage(deposit.userId, `❌ Your deposit of ${deposit.amount} USDT has been rejected. Please contact support.`);
                
                // Update admin message
                try {
                    await bot.editMessageText(`❌ Deposit rejected!\n\nUser: ${deposit.userId}\nAmount: ${deposit.amount} USDT`, {
                        chat_id: userId,
                        message_id: messageId
                    });
                } catch (editError) {
                    console.log('Could not edit admin message:', editError.message);
                }
            }
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle admin support reply
        if (data.startsWith('support_reply_') && isAdmin(userId)) {
            const targetUserId = data.split('_')[2];
            const adminData = readDB(DB_ADMIN);
            
            // Set admin in reply mode
            adminData.reply_mode[userId] = { target: parseInt(targetUserId), active: true };
            writeDB(DB_ADMIN, adminData);
            
            updateUser(userId, { state: 'admin_reply_mode' });
            
            bot.sendMessage(userId, `💬 Reply mode activated for user ${targetUserId}. Send your message now:`, {
                reply_markup: {
                    keyboard: [
                        [{ text: '❌ Cancel Reply' }]
                    ],
                    resize_keyboard: true
                }
            });
            
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        // Handle admin panel callbacks
        if (data.startsWith('admin_') && isAdmin(userId)) {
            if (data === 'admin_products') {
                try {
                    await bot.editMessageText('📦 Product Management\n\nSelect an option:', {
                        chat_id: userId,
                        message_id: messageId,
                        ...getProductManagementKeyboard()
                    });
                } catch (editError) {
                    bot.sendMessage(userId, '📦 Product Management\n\nSelect an option:', getProductManagementKeyboard());
                }
            } else if (data === 'admin_users') {
                const users = readDB(DB_USERS);
                const totalUsers = Object.keys(users).length;
                let totalBalance = 0;
                let totalDeposited = 0;
                
                Object.values(users).forEach(user => {
                    totalBalance += user.balance || 0;
                    totalDeposited += user.deposited || 0;
                });
                
                const message = `👥 User Statistics:
                
Total Users: ${totalUsers}
Total Balance: ${totalBalance} USDT
Total Deposited: ${totalDeposited} USDT
Average Balance: ${(totalBalance / totalUsers).toFixed(2)} USDT

Recent Users:
${Object.values(users).slice(-5).map(user => 
    `${user.id}: ${user.balance} USDT (${user.language})`
).join('\n')}`;
                
                try {
                    await bot.editMessageText(message, {
                        chat_id: userId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                } catch (editError) {
                    bot.sendMessage(userId, message, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Back', callback_data: 'admin_back' }]
                            ]
                        }
                    });
                }
            } else if (data === 'admin_back') {
                try {
                    await bot.editMessageText('🔧 Admin Panel\n\nSelect an option:', {
                        chat_id: userId,
                        message_id: messageId,
                        ...getAdminPanelKeyboard()
                    });
                } catch (editError) {
                    bot.sendMessage(userId, '🔧 Admin Panel\n\nSelect an option:', getAdminPanelKeyboard());
                }
            }
            
            bot.answerCallbackQuery(query.id);
            return;
        }
        
        bot.answerCallbackQuery(query.id);
        
    } catch (error) {
        console.error('Error handling callback query:', error);
        bot.answerCallbackQuery(query.id, { text: 'An error occurred. Please try again.', show_alert: true });
    }
});

// Handle text messages
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return; // Skip commands
    if (msg.photo) return; // Skip photos (handled separately)
    
    const userId = msg.from.id;
    const user = getUser(userId);
    const text = msg.text;
    
    if (!text) return;
    
    try {
        // Check if user needs to set language first
        if (!user.language_set) {
            bot.sendMessage(userId, getText(userId, 'welcome'), getLanguageKeyboard());
            return;
        }
        
        // Check channel membership
        const isMember = await checkChannelMembership(userId);
        if (!isMember) {
            bot.sendMessage(userId, getText(userId, 'join_channel'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: getText(userId, 'join_button'), url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }
                        ],
                        [
                            { text: getText(userId, 'check_button'), callback_data: 'check_membership' }
                        ]
                    ]
                }
            });
            return;
        }
        
        // Handle admin reply mode
        if (user.state === 'admin_reply_mode' && isAdmin(userId)) {
            if (text === '❌ Cancel Reply') {
                clearUserState(userId);
                const adminData = readDB(DB_ADMIN);
                delete adminData.reply_mode[userId];
                writeDB(DB_ADMIN, adminData);
                
                bot.sendMessage(userId, '✅ Reply mode cancelled.', {
                    reply_markup: { remove_keyboard: true }
                });
                return;
            }
            
            const adminData = readDB(DB_ADMIN);
            const targetUserId = adminData.reply_mode[userId]?.target;
            
            if (targetUserId) {
                // Send reply to user
                bot.sendMessage(targetUserId, `💬 Admin Reply:\n\n${text}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💬 Reply to Admin', callback_data: 'admin_support_reply' }]
                        ]
                    }
                });
                
                // Confirm to admin
                bot.sendMessage(userId, `✅ Message sent to user ${targetUserId}`, {
                    reply_markup: { remove_keyboard: true }
                });
                
                // Clear admin reply mode
                delete adminData.reply_mode[userId];
                writeDB(DB_ADMIN, adminData);
                clearUserState(userId);
            }
            return;
        }
        
        // Handle back button
        if (text === getText(userId, 'back')) {
            clearUserState(userId);
            bot.sendMessage(userId, getText(userId, 'main_menu'), getMainMenuKeyboard(userId));
            return;
        }
        
        // Handle states
        if (user.state === 'waiting_custom_amount') {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount < 1) {
                bot.sendMessage(userId, getText(userId, 'min_amount'));
                return;
            }
            
            updateUser(userId, { pending_deposit: amount, state: null });
            bot.sendMessage(userId, getText(userId, 'network_select'), getNetworkKeyboard(userId));
            return;
        }
        
        if (user.state === 'waiting_username') {
            const username = text.trim().replace('@', '');
            
            let message = `${getText(userId, 'confirm_username')}\n\n@${username}`;
            
            updateUser(userId, { pending_username: username });
            
            bot.sendMessage(userId, message, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: getText(userId, 'confirm'), callback_data: 'confirm_username' },
                            { text: getText(userId, 'cancel'), callback_data: 'cancel_username' }
                        ]
                    ]
                }
            });
            return;
        }
        
        if (user.state === 'waiting_quantity') {
            const quantity = parseInt(text);
            if (isNaN(quantity) || quantity < 1) {
                bot.sendMessage(userId, 'Please enter a valid quantity (minimum 1)');
                return;
            }
            
            const products = readDB(DB_PRODUCTS);
            const product = products[user.shop_type][user.shop_year][user.shop_month];
            const totalPrice = product.price * quantity;
            
            // Check funds first
            if (user.balance < totalPrice) {
                clearUserState(userId);
                bot.sendMessage(userId, getText(userId, 'please_topup'), {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: getText(userId, 'topup'), callback_data: 'show_topup' }]
                        ]
                    }
                });
                return;
            }
            
            // Check stock
            if (product.stock < quantity) {
                bot.sendMessage(userId, `❌ Not enough stock. Available: ${product.stock} pcs`);
                return;
            }
            
            // Process order
            const orderId = Date.now().toString();
            const orders = readDB(DB_ORDERS);
            
            orders[orderId] = {
                id: orderId,
                userId: userId,
                type: user.shop_type,
                year: user.shop_year,
                month: user.shop_month,
                quantity: quantity,
                price: product.price,
                total: totalPrice,
                username: user.pending_username,
                status: 'pending',
                created_at: Date.now()
            };
            
            writeDB(DB_ORDERS, orders);
            
            // Update user balance
            updateUser(userId, { 
                balance: user.balance - totalPrice,
                spent: user.spent + totalPrice,
                orders: user.orders + 1
            });
            
            // Clear user state
            clearUserState(userId);
            
            // Update product stock
            products[user.shop_type][user.shop_year][user.shop_month].stock -= quantity;
            writeDB(DB_PRODUCTS, products);
            
            // Send success message
            let successMessage = `✅ ${getText(userId, 'order_success')}\n\n`;
            successMessage += `📦 Type: ${user.shop_type}\n`;
            successMessage += `📅 Year: ${user.shop_year}\n`;
            successMessage += `🗓️ Month: ${user.shop_month}\n`;
            successMessage += `👤 Username: @${user.pending_username}\n`;
            successMessage += `🔢 Quantity: ${quantity}\n`;
            successMessage += `💰 Total: ${totalPrice} USDT\n`;
            successMessage += `🆔 ${getText(userId, 'order_id')} ${orderId}`;
            
            bot.sendMessage(userId, successMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: getText(userId, 'contact_admin'), url: `https://t.me/${ADMIN_USERNAME.replace('@', '')}` }]
                    ]
                }
            });
            
            // Notify admin
            ADMIN_IDS.forEach(adminId => {
                bot.sendMessage(adminId, `🔔 ${getText(userId, 'new_order')}\n\n${successMessage}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'View Orders', callback_data: 'admin_orders' }]
                        ]
                    }
                });
            });
            
            return;
        }
        
        if (user.state === 'support_chat') {
            // Forward message to admin
            ADMIN_IDS.forEach(adminId => {
                bot.sendMessage(adminId, `💬 Support Message from ${userId}:\n\n${text}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Reply', callback_data: `support_reply_${userId}` }]
                        ]
                    }
                });
            });
            
            bot.sendMessage(userId, '✅ Your message has been sent to support. We will reply soon!');
            return;
        }
        
        // Handle main menu buttons
        if (text === getText(userId, 'wallet')) {
            let message = `💳 ${getText(userId, 'wallet')}\n\n`;
            message += `💰 ${getText(userId, 'balance')} ${user.balance} USDT\n`;
            message += `📋 ${getText(userId, 'your_orders')} ${user.orders} pcs\n`;
            message += `📈 ${getText(userId, 'deposited')} ${user.deposited} USDT\n`;
            message += `💸 ${getText(userId, 'spent')} ${user.spent} USDT`;
            
            bot.sendMessage(userId, message, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: getText(userId, 'topup'), callback_data: 'show_topup' }]
                    ]
                }
            });
            return;
        }
        
        if (text === getText(userId, 'shop')) {
            clearUserState(userId);
            bot.sendMessage(userId, getText(userId, 'select_type'), {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: getText(userId, 'group'), callback_data: 'shop_groups' },
                            { text: getText(userId, 'channel'), callback_data: 'shop_channels' }
                        ]
                    ]
                }
            });
            return;
        }
        
        if (text === getText(userId, 'ready_made')) {
            clearUserState(userId);
            bot.sendMessage(userId, getText(userId, 'admin_ready_made'), {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: getText(userId, 'contact_admin'), url: `https://t.me/${ADMIN_USERNAME.replace('@', '')}` }]
                    ]
                }
            });
            return;
        }
        
        if (text === getText(userId, 'orders')) {
            clearUserState(userId);
            const orders = readDB(DB_ORDERS);
            const userOrders = Object.values(orders).filter(order => order.userId === userId);
            
            if (userOrders.length === 0) {
                bot.sendMessage(userId, getText(userId, 'no_orders'), {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: getText(userId, 'order_history'), callback_data: 'order_history' }]
                        ]
                    }
                });
            } else {
                let message = `📋 Your Active Orders:\n\n`;
                userOrders.forEach(order => {
                    message += `🆔 ${order.id}\n`;
                    message += `📦 ${order.type} - ${order.year} - ${order.month}\n`;
                    message += `🔢 Quantity: ${order.quantity}\n`;
                    message += `💰 Total: ${order.total} USDT\n`;
                    message += `📅 ${new Date(order.created_at).toLocaleDateString()}\n\n`;
                });
                
                bot.sendMessage(userId, message, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: getText(userId, 'order_history'), callback_data: 'order_history' }]
                        ]
                    }
                });
            }
            return;
        }
        
        if (text === getText(userId, 'statistics')) {
            clearUserState(userId);
            bot.sendMessage(userId, formatStatistics(userId), {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: getText(userId, 'update'), callback_data: 'update_stats' }]
                    ]
                }
            });
            return;
        }
        
        if (text === getText(userId, 'support')) {
            clearUserState(userId);
            bot.sendMessage(userId, getText(userId, 'send_feedback'), getCancelKeyboard(userId));
            updateUser(userId, { state: 'support_chat' });
            return;
        }
        
        if (text === getText(userId, 'guide')) {
            clearUserState(userId);
            bot.sendMessage(userId, getText(userId, 'guide_text'));
            return;
        }
        
        if (text === getText(userId, 'settings')) {
            clearUserState(userId);
            bot.sendMessage(userId, getText(userId, 'welcome'), getLanguageKeyboard());
            return;
        }
        
        // If no matching handler, send help
        bot.sendMessage(userId, getText(userId, 'help_text'));
        
    } catch (error) {
        console.error('Error handling message:', error);
        bot.sendMessage(userId, 'An error occurred. Please try again or contact support.');
    }
});

// Handle photo messages (for deposit proof)
bot.on('photo', async (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId);
    
    try {
        if (user.state === 'waiting_transfer_proof') {
            const depositId = Date.now().toString();
            const deposits = readDB(DB_DEPOSITS);
            
            deposits[depositId] = {
                id: depositId,
                userId: userId,
                amount: user.pending_deposit,
                network: user.selected_network,
                photo_id: msg.photo[msg.photo.length - 1].file_id,
                status: 'pending',
                created_at: Date.now()
            };
            
            writeDB(DB_DEPOSITS, deposits);
            
            // Send to admin for approval
            ADMIN_IDS.forEach(adminId => {
                bot.sendPhoto(adminId, msg.photo[msg.photo.length - 1].file_id, {
                    caption: `💰 New Deposit Request\n\nUser: ${userId}\nAmount: ${user.pending_deposit} USDT\nNetwork: ${user.selected_network}\nDeposit ID: ${depositId}`,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Approve', callback_data: `approve_deposit_${depositId}` },
                                { text: '❌ Reject', callback_data: `reject_deposit_${depositId}` }
                            ]
                        ]
                    }
                });
            });
            
            bot.sendMessage(userId, getText(userId, 'wait_confirmation'));
            clearUserState(userId);
            return;
        }
    } catch (error) {
        console.error('Error handling photo:', error);
        bot.sendMessage(userId, 'An error occurred while processing your photo. Please try again.');
    }
});

// Comprehensive error handling
bot.on('error', (error) => {
    console.error('Bot error:', error);
    // Don't crash, just log the error
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    // Don't crash, just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't crash, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't crash, just log the error
});

console.log('🚀 Bot started successfully!');
console.log('📝 Configuration:');
console.log(`- Channel: ${REQUIRED_CHANNEL}`);
console.log(`- Channel ID: ${REQUIRED_CHANNEL_ID}`);
console.log(`- Admin Username: ${ADMIN_USERNAME}`);
console.log(`- Admin IDs: ${ADMIN_IDS.join(', ')}`);
console.log(`- Group Price: $${DEFAULT_PRICES.groups}`);
console.log(`- Channel Price: $${DEFAULT_PRICES.channels}`);
console.log('\n✅ Bot is ready to handle multiple users simultaneously!');

// Export bot for potential external use
module.exports = bot;
