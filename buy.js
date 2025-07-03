const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Bot Token - Ganti dengan token bot Anda
const BOT_TOKEN = '7559754047:AAFkYOw7i6acsYJKfbS6dLKaJWojFL_6aig';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Admin Configuration
const ADMIN_IDS = [5988451717]; // Ganti dengan ID admin Anda
const REQUIRED_CHANNEL = '@listprojec'; // Channel wajib join
const USDT_ADDRESSES = {
    TRC20: 'TUGeTtQdrMVhHubtYo41fGAE1348oWzLu8',
    BEP20: '0x4f1834cD8e3293c48D3f2d217490d22dCd9BC7D3'
};

// Database Files
const DB_USERS = 'users.json';
const DB_PRODUCTS = 'products.json';
const DB_ORDERS = 'orders.json';
const DB_DEPOSITS = 'deposits.json';
const DB_SUPPORT = 'support.json';

// Initialize databases
function initDatabase() {
    const databases = [
        { file: DB_USERS, default: {} },
        { file: DB_PRODUCTS, default: { 
            groups: { 
                2023: { 
                    january: { stock: 0, price: 1 }, february: { stock: 0, price: 1 }, march: { stock: 0, price: 1 },
                    april: { stock: 0, price: 1 }, may: { stock: 0, price: 1 }, june: { stock: 0, price: 1 },
                    july: { stock: 0, price: 1 }, august: { stock: 0, price: 1 }, september: { stock: 0, price: 1 },
                    october: { stock: 0, price: 1 }, november: { stock: 0, price: 1 }, december: { stock: 0, price: 1 }
                },
                2024: { 
                    january: { stock: 0, price: 3 }, february: { stock: 0, price: 3 }, march: { stock: 0, price: 3 },
                    april: { stock: 0, price: 3 }, may: { stock: 0, price: 3 }, june: { stock: 0, price: 3 },
                    july: { stock: 0, price: 3 }, august: { stock: 0, price: 3 }, september: { stock: 0, price: 3 },
                    october: { stock: 0, price: 3 }, november: { stock: 0, price: 3 }, december: { stock: 0, price: 3 }
                }
            }, 
            channels: {
                2022: { 
                    january: { stock: 0, price: 1 }, february: { stock: 0, price: 1 }, march: { stock: 0, price: 1 },
                    april: { stock: 0, price: 1 }, may: { stock: 0, price: 1 }, june: { stock: 0, price: 1 },
                    july: { stock: 0, price: 1 }, august: { stock: 0, price: 1 }, september: { stock: 0, price: 1 },
                    october: { stock: 0, price: 1 }, november: { stock: 0, price: 1 }, december: { stock: 0, price: 1 }
                },
                2023: { 
                    january: { stock: 0, price: 1 }, february: { stock: 0, price: 1 }, march: { stock: 0, price: 1 },
                    april: { stock: 0, price: 1 }, may: { stock: 0, price: 1 }, june: { stock: 0, price: 1 },
                    july: { stock: 0, price: 1 }, august: { stock: 0, price: 1 }, september: { stock: 0, price: 1 },
                    october: { stock: 0, price: 1 }, november: { stock: 0, price: 1 }, december: { stock: 0, price: 1 }
                }
            }
        } },
        { file: DB_ORDERS, default: {} },
        { file: DB_DEPOSITS, default: {} },
        { file: DB_SUPPORT, default: {} }
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
        insufficient_funds: "❌ Insufficient funds. Please re-enter the count:",
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
        send_feedback: "💬 Please send your feedback.",
        join_channel: "⚠️ You must join our channel first to use this bot:",
        join_button: "📢 Join Channel",
        check_button: "✅ Check Membership",
        not_member: "❌ You are not a member of our channel yet. Please join first.",
        network_select: "🌐 Select USDT Network:",
        transfer_to: "💳 Transfer to address:",
        with_amount: "💰 Amount:",
        admin_ready_made: "✅ Ready-made accounts feature - Contact admin directly",
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

❗ For errors or issues: @Sanjarbek_2557`,
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
        insufficient_funds: "❌ Saldo tidak cukup. Silakan masukkan kembali jumlahnya:",
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
        send_feedback: "💬 Silakan kirim masukan Anda.",
        join_channel: "⚠️ Anda harus bergabung dengan channel kami terlebih dahulu untuk menggunakan bot ini:",
        join_button: "📢 Bergabung ke Channel",
        check_button: "✅ Periksa Keanggotaan",
        not_member: "❌ Anda belum menjadi anggota channel kami. Silakan bergabung terlebih dahulu.",
        network_select: "🌐 Pilih Jaringan USDT:",
        transfer_to: "💳 Transfer ke alamat:",
        with_amount: "💰 Jumlah:",
        admin_ready_made: "✅ Fitur akun siap pakai - Hubungi admin langsung",
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

❗ Untuk kesalahan atau masalah: @Sanjarbek_2557`,
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
        insufficient_funds: "❌ 余额不足。请重新输入数量：",
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
        send_feedback: "💬 请发送您的反馈。",
        join_channel: "⚠️ 您必须先加入我们的频道才能使用此机器人：",
        join_button: "📢 加入频道",
        check_button: "✅ 检查成员资格",
        not_member: "❌ 您还不是我们频道的成员。请先加入。",
        network_select: "🌐 选择 USDT 网络：",
        transfer_to: "💳 转账到地址：",
        with_amount: "💰 金额：",
        admin_ready_made: "✅ 现成账户功能 - 直接联系管理员",
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

❗ 如有错误或问题：@Sanjarbek_2557`,
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
        insufficient_funds: "❌ Mablag' yetarli emas. Iltimos, soni qayta kiriting:",
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
        send_feedback: "💬 Iltimos, fikr-mulohazangizni yuboring.",
        join_channel: "⚠️ Ushbu botdan foydalanish uchun avval bizning kanalimizga qo'shilishingiz kerak:",
        join_button: "📢 Kanalga qo'shilish",
        check_button: "✅ A'zolikni tekshirish",
        not_member: "❌ Siz hali bizning kanal a'zosi emassiz. Iltimos, avval qo'shiling.",
        network_select: "🌐 USDT tarmog'ini tanlang:",
        transfer_to: "💳 Manzilga o'tkazish:",
        with_amount: "💰 Miqdor:",
        admin_ready_made: "✅ Tayyor akkauntlar xususiyati - Admin bilan bevosita bog'laning",
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

❗ Xatolar yoki muammolar uchun: @Sanjarbek_2557`,
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
        insufficient_funds: "❌ Недостаточно средств. Пожалуйста, введите количество заново:",
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
        send_feedback: "💬 Пожалуйста, отправьте ваш отзыв.",
        join_channel: "⚠️ Вы должны сначала присоединиться к нашему каналу, чтобы использовать этого бота:",
        join_button: "📢 Присоединиться к каналу",
        check_button: "✅ Проверить членство",
        not_member: "❌ Вы еще не являетесь участником нашего канала. Пожалуйста, сначала присоединитесь.",
        network_select: "🌐 Выберите сеть USDT:",
        transfer_to: "💳 Перевести на адрес:",
        with_amount: "💰 Сумма:",
        admin_ready_made: "✅ Функция готовых аккаунтов - Свяжитесь с администратором напрямую",
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

❗ При ошибках или проблемах: @Sanjarbek_2557`,
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
    return translations[userLang][key] || translations['en'][key] || key;
}

// Get user data
function getUser(userId) {
    const users = readDB(DB_USERS);
    if (!users[userId]) {
        users[userId] = {
            id: userId,
            language: 'en',
            balance: 0,
            deposited: 0,
            spent: 0,
            orders: 0,
            joined: Date.now()
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

// Check if user is member of required channel
async function checkChannelMembership(userId) {
    try {
        const member = await bot.getChatMember(REQUIRED_CHANNEL, userId);
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
    const user = getUser(userId);
    const lang = user.language;
    
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
    
    const keyboard = [];
    const monthNames = translations[getUser(userId).language].months;
    
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
    const user = getUser(userId);
    
    let message = `📊 ${getText(userId, 'total_users')} ${stats.totalUsers} pcs\n`;
    message += `👥 ${getText(userId, 'group_orders')} ${stats.totalGroupOrders} pcs\n\n`;
    
    // Groups statistics
    message += `—————— 2024 ——————\n`;
    message += `📅 Groups: ${stats.products.groups['2024'] ? Object.values(stats.products.groups['2024']).reduce((sum, month) => sum + month.stock, 0) : 0} pcs\n`;
    message += `💰 Price: ${stats.products.groups['2024'] ? stats.products.groups['2024'].january.price : 3} USDT\n\n`;
    
    // Channels statistics
    message += `—————— 2022 ——————\n`;
    message += `📅 Channels: ${stats.products.channels['2022'] ? Object.values(stats.products.channels['2022']).reduce((sum, month) => sum + month.stock, 0) : 0} pcs\n`;
    message += `💰 Price: ${stats.products.channels['2022'] ? stats.products.channels['2022'].january.price : 1} USDT\n\n`;
    
    message += `—————— 2023 ——————\n`;
    message += `📅 Channels: ${stats.products.channels['2023'] ? Object.values(stats.products.channels['2023']).reduce((sum, month) => sum + month.stock, 0) : 0} pcs\n`;
    message += `💰 Price: ${stats.products.channels['2023'] ? stats.products.channels['2023'].january.price : 1} USDT`;
    
    return message;
}

// Initialize database
initDatabase();

// Set commands
bot.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Get help' }
]);

// Handle /start command
bot.onText(/\/start/, async (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId);
    
    if (!user.language_set) {
        bot.sendMessage(userId, getText(userId, 'welcome'), getLanguageKeyboard());
        return;
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
        return;
    }
    
    bot.sendMessage(userId, getText(userId, 'main_menu'), getMainMenuKeyboard(userId));
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
    const userId = msg.from.id;
    bot.sendMessage(userId, getText(userId, 'help_text'));
});

// Handle callback queries
bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const data = query.data;
    const messageId = query.message.message_id;
    
    // Handle language selection
    if (data.startsWith('lang_')) {
        const lang = data.split('_')[1];
        updateUser(userId, { language: lang, language_set: true });
        
        bot.editMessageText(translations[lang].welcome, {
            chat_id: userId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Language Selected', callback_data: 'lang_selected' }]
                ]
            }
        });
        
        setTimeout(() => {
            bot.deleteMessage(userId, messageId);
            bot.sendMessage(userId, getText(userId, 'main_menu'), getMainMenuKeyboard(userId));
        }, 2000);
        return;
    }
    
    // Check membership
    if (data === 'check_membership') {
        const isMember = await checkChannelMembership(userId);
        if (isMember) {
            bot.editMessageText(getText(userId, 'main_menu'), {
                chat_id: userId,
                message_id: messageId
            });
            setTimeout(() => {
                bot.deleteMessage(userId, messageId);
                bot.sendMessage(userId, getText(userId, 'main_menu'), getMainMenuKeyboard(userId));
            }, 1000);
        } else {
            bot.answerCallbackQuery(query.id, { text: getText(userId, 'not_member'), show_alert: true });
        }
        return;
    }
    
    // Handle topup amounts
    if (data.startsWith('topup_')) {
        const amount = data.split('_')[1];
        
        if (amount === 'custom') {
            bot.editMessageText(getText(userId, 'custom_amount'), {
                chat_id: userId,
                message_id: messageId
            });
            updateUser(userId, { state: 'waiting_custom_amount' });
            return;
        }
        
        const numAmount = parseInt(amount);
        if (numAmount >= 1) {
            updateUser(userId, { pending_deposit: numAmount });
            bot.editMessageText(getText(userId, 'network_select'), {
                chat_id: userId,
                message_id: messageId,
                ...getNetworkKeyboard(userId)
            });
        }
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
        
        bot.editMessageText(message, {
            chat_id: userId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: getText(userId, 'confirm'), callback_data: 'confirm_transfer' }]
                ]
            }
        });
        
        updateUser(userId, { state: 'waiting_transfer_proof', selected_network: network });
        return;
    }
    
    // Handle transfer confirmation
    if (data === 'confirm_transfer') {
        bot.editMessageText(getText(userId, 'send_proof'), {
            chat_id: userId,
            message_id: messageId
        });
        updateUser(userId, { state: 'waiting_transfer_proof' });
        return;
    }
    
    // Handle shop type selection
    if (data === 'shop_groups' || data === 'shop_channels') {
        const type = data.split('_')[1];
        updateUser(userId, { shop_type: type });
        
        bot.editMessageText(getText(userId, 'select_year'), {
            chat_id: userId,
            message_id: messageId,
            ...getYearKeyboard(type)
        });
        return;
    }
    
    // Handle year selection
    if (data.startsWith('year_')) {
        const year = data.split('_')[1];
        const user = getUser(userId);
        
        updateUser(userId, { shop_year: year });
        
        bot.editMessageText(getText(userId, 'select_month'), {
            chat_id: userId,
            message_id: messageId,
            ...getMonthKeyboard(userId, user.shop_type, year)
        });
        return;
    }
    
    // Handle month selection
    if (data.startsWith('month_')) {
        const month = data.split('_')[1];
        const user = getUser(userId);
        
        updateUser(userId, { shop_month: month });
        
        bot.editMessageText(getText(userId, 'enter_username'), {
            chat_id: userId,
            message_id: messageId
        });
        
        updateUser(userId, { state: 'waiting_username' });
        return;
    }
    
    // Handle username confirmation
    if (data === 'confirm_username') {
        const user = getUser(userId);
        const products = readDB(DB_PRODUCTS);
        const product = products[user.shop_type][user.shop_year][user.shop_month];
        
        let message = `💰 ${getText(userId, 'group_price')} ${product.price} USDT\n\n`;
        message += getText(userId, 'enter_count');
        
        bot.editMessageText(message, {
            chat_id: userId,
            message_id: messageId
        });
        
        updateUser(userId, { state: 'waiting_quantity' });
        return;
    }
    
    if (data === 'cancel_username') {
        bot.editMessageText(getText(userId, 'main_menu'), {
            chat_id: userId,
            message_id: messageId
        });
        updateUser(userId, { state: null });
        return;
    }
    
    // Handle statistics update
    if (data === 'update_stats') {
        bot.editMessageText(formatStatistics(userId), {
            chat_id: userId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: getText(userId, 'update'), callback_data: 'update_stats' }]
                ]
            }
        });
        return;
    }
    
    // Handle deposit approval (admin only)
    if (data.startsWith('approve_deposit_') && ADMIN_IDS.includes(userId)) {
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
            bot.editMessageText(`✅ Deposit approved!\n\nUser: ${deposit.userId}\nAmount: ${deposit.amount} USDT`, {
                chat_id: userId,
                message_id: messageId
            });
        }
        return;
    }
    
    // Handle deposit rejection (admin only)
    if (data.startsWith('reject_deposit_') && ADMIN_IDS.includes(userId)) {
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
            bot.editMessageText(`❌ Deposit rejected!\n\nUser: ${deposit.userId}\nAmount: ${deposit.amount} USDT`, {
                chat_id: userId,
                message_id: messageId
            });
        }
        return;
    }
    
    bot.answerCallbackQuery(query.id);
});

// Handle text messages
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return; // Skip commands
    
    const userId = msg.from.id;
    const user = getUser(userId);
    const text = msg.text;
    
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
        const username = text.trim();
        
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
        
        if (user.balance < totalPrice) {
            bot.sendMessage(userId, `${getText(userId, 'insufficient_funds')} Please re-enter the count:`);
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
            orders: user.orders + 1,
            state: null
        });
        
        // Update product stock
        products[user.shop_type][user.shop_year][user.shop_month].stock -= quantity;
        writeDB(DB_PRODUCTS, products);
        
        // Send success message
        let successMessage = `✅ Order Successful!\n\n`;
        successMessage += `📦 Type: ${user.shop_type}\n`;
        successMessage += `📅 Year: ${user.shop_year}\n`;
        successMessage += `🗓️ Month: ${user.shop_month}\n`;
        successMessage += `👤 Username: @${user.pending_username}\n`;
        successMessage += `🔢 Quantity: ${quantity}\n`;
        successMessage += `💰 Total: ${totalPrice} USDT\n`;
        successMessage += `🆔 Order ID: ${orderId}`;
        
        bot.sendMessage(userId, successMessage, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Contact Admin', url: 'https://t.me/Sanjarbek_2557' }]
                ]
            }
        });
        
        // Notify admin
        ADMIN_IDS.forEach(adminId => {
            bot.sendMessage(adminId, `🔔 New Order!\n\n${successMessage}`, {
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
        bot.sendMessage(userId, getText(userId, 'admin_ready_made'), {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Contact Admin', url: 'https://t.me/Sanjarbek_2557' }]
                ]
            }
        });
        return;
    }
    
    if (text === getText(userId, 'orders')) {
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
            
            bot.sendMessage(userId, message);
        }
        return;
    }
    
    if (text === getText(userId, 'statistics')) {
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
        bot.sendMessage(userId, getText(userId, 'send_feedback'), {
            reply_markup: {
                keyboard: [
                    [{ text: getText(userId, 'back') }]
                ],
                resize_keyboard: true
            }
        });
        
        updateUser(userId, { state: 'support_chat' });
        return;
    }
    
    if (text === getText(userId, 'guide')) {
        bot.sendMessage(userId, getText(userId, 'guide_text'));
        return;
    }
    
    if (text === getText(userId, 'settings')) {
        bot.sendMessage(userId, getText(userId, 'welcome'), getLanguageKeyboard());
        return;
    }
    
    if (text === getText(userId, 'back')) {
        updateUser(userId, { state: null });
        bot.sendMessage(userId, getText(userId, 'main_menu'), getMainMenuKeyboard(userId));
        return;
    }
    
    // Handle callback queries that are sent via inline keyboards
    if (text === 'show_topup') {
        bot.sendMessage(userId, getText(userId, 'select_amount'), getTopupKeyboard(userId));
        return;
    }
});

// Handle photo messages (for deposit proof)
bot.on('photo', async (msg) => {
    const userId = msg.from.id;
    const user = getUser(userId);
    
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
        updateUser(userId, { state: null });
        return;
    }
});

// Error handling
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

console.log('🚀 Bot started successfully!');
console.log('📝 Make sure to:');
console.log('1. Replace BOT_TOKEN with your actual bot token');
console.log('2. Replace ADMIN_IDS with your admin Telegram IDs');
console.log('3. Replace REQUIRED_CHANNEL with your channel username');
console.log('4. Install required dependencies: npm install node-telegram-bot-api');

// Export bot for potential external use
module.exports = bot;
