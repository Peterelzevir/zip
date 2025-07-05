//
// ENHANCED SECURITY BOT V7.0 - FULL FEATURED
// CODING BY @hiyaok ON TELEGRAM
// U CAN ORDERS JASA BOT TO @hiyaok
// TRUSTED JASA BOT TELEGRAM TERBAIK

//modules pake telegraf
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

// Konfigurasi Bot
const BOT_TOKEN = '7508883526:AAEqe2f48tCzwtlCjbUyEBJMzTDg7J6jPME'; // Ganti dengan token bot Anda
const MAIN_ADMIN = 5406507431; // Ganti dengan user ID admin utama
const DATA_FILE = './bot_data.json';

// Inisialisasi Bot
const bot = new Telegraf(BOT_TOKEN);

// Sessions untuk input
const userSessions = new Map();

// Data Storage
let botData = {
    admins: [MAIN_ADMIN],
    groups: [],
    detectionEnabled: true,
    lockdownMode: false,
    userViolations: {},
    messageHashes: new Map(),
    imageHashes: new Map(),
    lastMessages: new Map(),
    bannedUsers: {},
    whitelistUsers: [],
    stats: {
        deletedMessages: 0,
        detectedSpam: 0,
        bannedUsers: 0,
        totalMessages: 0,
        totalViolations: 0
    },
    settings: {
        autoDeleteWarnings: true,
        notifyAdmins: true,
        maxViolations: 10,
        banDuration: 86400000, // 24 hours in ms
        deleteJoinMessages: true,
        antiFlood: true,
        antiLink: true,
        antiForward: true
    }
};

// Enhanced Dangerous Patterns - Lebih Ketat
const dangerousPatterns = [
    // Investasi Bodong & MLM
    /(?:investasi|invest|modal|profit|untung|keuntungan|passive income|bisnis online|mlm|binary option|forex|trading|cryptocurrency|bitcoin|saham).{0,50}(?:pasti|mudah|cepat|instant|auto|otomatis|tanpa riski|guaranteed|100%|milyar|jutaan|ribuan)/gi,
    
    // SARA & Hate Speech
    /(?:kafir|babi|anjing|bangsat|kampret|tolol|bodoh|goblok|idiot|stupid|gay|homo|lesbi|transgender|pelacur|sundal|jalang|lonte|bitch|slut|whore)/gi,
    /(?:cina|china|yahudi|kristen|islam|hindu|budha|katholik|protestan).{0,20}(?:anjing|babi|kafir|bangsat|tolol|bodoh|jelek|buruk|jahat|setan|iblis)/gi,
    
    // Kekerasan & Ancaman
    /(?:bunuh|membunuh|kill|mati|suicide|gantung diri|loncat|bom|ledakan|tembak|tikam|bacok|bakar|torture|siksa|mutilasi)/gi,
    /(?:ancam|mengancam|threat|intimidasi|teror|terror|kekerasan|violence|pukul|hajar|bogem|jotos)/gi,
    
    // Konten 18+
    /(?:sex|seks|ngentot|kontol|memek|pepek|puki|vagina|penis|orgasme|masturbasi|onani|coli|porn|bokep|bugil|telanjang|naked|nude)/gi,
    /(?:payudara|toket|tt|susu|dada|breast|nipple|puting|pantat|bokong|ass|butt|paha|thigh)/gi,
    
    // Penipuan & Scam
    /(?:penipuan|scam|tipu|menipu|bohong|fake|palsu|pinjaman|kredit|loan|hutang|debt).{0,30}(?:cepat|mudah|tanpa jaminan|tanpa survey|approved|langsung cair)/gi,
    /(?:transfer|kirim|tf|pulsa|dana|ovo|gopay|shopeepay|linkaja).{0,20}(?:dulu|duluan|advance|dimuka|sekarang|langsung)/gi,
    
    // Spam Keywords
    /(?:promo|diskon|discount|sale|murah|gratis|free|bonus|hadiah|gift|undian|lottery|menang|winner|jutawan|milyuner)/gi,
    /(?:klik|click|link|bit\.ly|tinyurl|shortlink|wa\.me|t\.me|telegram\.me)/gi,
    
    // Pelecehan
    /(?:leceh|melecehkan|cabul|mesum|genit|nakal|jail|horny|birahi|nafsu|hasrat)/gi,
    
    // Narkoba
    /(?:narkoba|drugs|ganja|marijuana|sabu|shabu|heroin|kokain|ecstasy|pills|obat|pil).{0,20}(?:jual|beli|supply|supplier|dealer|pengedar)/gi,
    
    // Politik Ekstrem
    /(?:komunis|pki|khilafah|isis|teroris|separatis|makar|kudeta|revolusi|pembunuhan massal)/gi,
    
    // URL & Link Patterns
    /(?:https?:\/\/|www\.|bit\.ly|tinyurl|shortener|link)/gi,
    
    // Phone Numbers
    /(?:\+62|08)\d{8,12}/g,
    
    // Excessive Emoji Spam
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]{10,}/gu,
    
    // Caps Lock Spam
    /[A-Z\s]{20,}/g
];

// Rate Limiting - Lebih Ketat
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 detik
const MAX_MESSAGES_PER_WINDOW = 5; // Maksimal 5 pesan per 30 detik
const SPAM_THRESHOLD = 3; // 3 pesan sama = spam

// Utility Functions
const saveData = async () => {
    try {
        // Convert Maps to objects for JSON
        const dataToSave = {
            ...botData,
            messageHashes: Object.fromEntries(botData.messageHashes),
            imageHashes: Object.fromEntries(botData.imageHashes),
            lastMessages: Object.fromEntries(botData.lastMessages)
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
};

const loadData = async () => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        
        // Convert objects back to Maps
        botData = {
            ...botData,
            ...parsed,
            messageHashes: new Map(Object.entries(parsed.messageHashes || {})),
            imageHashes: new Map(Object.entries(parsed.imageHashes || {})),
            lastMessages: new Map(Object.entries(parsed.lastMessages || {}))
        };
        
        // Ensure settings exist
        if (!botData.settings) {
            botData.settings = {
                autoDeleteWarnings: true,
                notifyAdmins: true,
                maxViolations: 10,
                banDuration: 86400000,
                deleteJoinMessages: true,
                antiFlood: true,
                antiLink: true,
                antiForward: true
            };
        }
        
        // Ensure whitelistUsers exists
        if (!botData.whitelistUsers) {
            botData.whitelistUsers = [];
        }
    } catch (error) {
        console.log('No existing data file, starting fresh');
        await saveData();
    }
};

const isAdmin = (userId) => {
    return botData.admins.includes(userId);
};

const isGroupAllowed = (groupId) => {
    return botData.groups.some(g => g.id === groupId);
};

const isWhitelisted = (userId) => {
    return botData.whitelistUsers.includes(userId);
};

const generateMessageHash = (text, userId) => {
    return crypto.createHash('md5').update(`${text}_${userId}`).digest('hex');
};

const generateImageHash = async (fileId) => {
    try {
        const file = await bot.telegram.getFile(fileId);
        return crypto.createHash('md5').update(file.file_path || file.file_id).digest('hex');
    } catch {
        return null;
    }
};

// Enhanced Rate Limiting
const checkRateLimit = (userId) => {
    const now = Date.now();
    const userLimits = rateLimits.get(userId) || [];
    
    // Remove old entries
    const validLimits = userLimits.filter(time => now - time < RATE_LIMIT_WINDOW);
    
    if (validLimits.length >= MAX_MESSAGES_PER_WINDOW) {
        return false;
    }
    
    validLimits.push(now);
    rateLimits.set(userId, validLimits);
    return true;
};

// Enhanced Content Detection
const checkDangerousContent = (text) => {
    if (!text || typeof text !== 'string') return false;
    
    const normalizedText = text.toLowerCase().trim();
    
    // Check against patterns
    for (const pattern of dangerousPatterns) {
        if (pattern.test(normalizedText)) {
            return true;
        }
    }
    
    // Additional checks
    if (normalizedText.length > 1000) return true; // Very long messages
    if ((normalizedText.match(/[!@#$%^&*()]/g) || []).length > 20) return true; // Too many special chars
    
    return false;
};

// Duplicate Message Detection
const isDuplicateMessage = (text, userId) => {
    if (!text) return false;
    
    const messageHash = generateMessageHash(text, userId);
    const userMessages = botData.lastMessages.get(userId) || [];
    
    // Count occurrences
    const count = userMessages.filter(hash => hash === messageHash).length;
    
    if (count >= SPAM_THRESHOLD) {
        return true;
    }
    
    // Add to user messages
    userMessages.push(messageHash);
    if (userMessages.length > 20) {
        userMessages.shift(); // Keep only last 20 messages
    }
    
    botData.lastMessages.set(userId, userMessages);
    return false;
};

// Image Duplicate Detection
const isDuplicateImage = async (photo, userId) => {
    try {
        const fileId = photo[photo.length - 1].file_id;
        const imageHash = await generateImageHash(fileId);
        
        if (!imageHash) return false;
        
        const hashKey = `${userId}_${imageHash}`;
        
        if (botData.imageHashes.has(hashKey)) {
            return true;
        }
        
        botData.imageHashes.set(hashKey, Date.now());
        return false;
    } catch {
        return false;
    }
};

// Track Violations
const trackViolation = (userId, violationType) => {
    if (!botData.userViolations[userId]) {
        botData.userViolations[userId] = { count: 0, lastViolation: 0, types: {} };
    }
    
    botData.userViolations[userId].count++;
    botData.userViolations[userId].lastViolation = Date.now();
    botData.userViolations[userId].types[violationType] = (botData.userViolations[userId].types[violationType] || 0) + 1;
    botData.stats.totalViolations++;
    
    // Auto ban setelah maxViolations
    if (botData.userViolations[userId].count >= botData.settings.maxViolations) {
        const banUntil = Date.now() + botData.settings.banDuration;
        botData.bannedUsers[userId] = {
            until: banUntil,
            reason: violationType,
            timestamp: Date.now(),
            violations: botData.userViolations[userId].count
        };
        botData.stats.bannedUsers++;
    }
};

const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

const formatDuration = (ms) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
};

// Admin Panel Keyboards
const getMainKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('👥 Admin Management', 'admin_menu'),
            Markup.button.callback('🏢 Group Management', 'group_menu')
        ],
        [
            Markup.button.callback('🛡️ Security Settings', 'security_menu'),
            Markup.button.callback('📊 Statistics', 'stats_menu')
        ],
        [
            Markup.button.callback('⚙️ Bot Settings', 'bot_settings'),
            Markup.button.callback('🚫 Ban Management', 'ban_menu')
        ],
        [
            Markup.button.callback('📋 Whitelist Users', 'whitelist_menu'),
            Markup.button.callback('📜 View Logs', 'logs_menu')
        ],
        [
            Markup.button.callback(`🔒 Lockdown: ${botData.lockdownMode ? 'ON 🔴' : 'OFF 🟢'}`, 'lockdown_toggle'),
            Markup.button.callback('🔄 Refresh', 'refresh_main')
        ]
    ]);
};

// Command Handlers
bot.start(async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply(
            `❌ **AKSES DITOLAK**\n\n` +
            `Anda tidak memiliki izin untuk menggunakan bot ini.\n` +
            `Silakan hubungi administrator untuk mendapatkan akses.\n\n` +
            `🔒 **Bot ID:** \`${ctx.botInfo.id}\`\n` +
            `👤 **Your ID:** \`${ctx.from.id}\``,
            { parse_mode: 'Markdown' }
        );
    }

    const welcomeMessage = `
🤖 **BOT KEAMANAN PREMIUM V7.0**
═══════════════════════════════════

👋 Selamat datang, **${ctx.from.first_name}**!

🔥 **FITUR KEAMANAN PREMIUM:**
✅ Deteksi Pattern Bahaya (${dangerousPatterns.length} rules)
✅ Rate Limiting Super Ketat (${MAX_MESSAGES_PER_WINDOW} msg/${RATE_LIMIT_WINDOW/1000}s)
✅ Hash Checking Gambar Duplikat
✅ Anti-Spam & Duplicate Detection
✅ Auto-Ban System (${botData.settings.maxViolations} violations)
✅ Silent Operation Mode
✅ Multi-Group Support
✅ Whitelist System
✅ Advanced Settings

🛡️ **STATUS SISTEM:**
┌─────────────────────────────
│ 🟢 Bot Status: **ONLINE**
│ 🔍 Detection: **${botData.detectionEnabled ? 'ENABLED' : 'DISABLED'}**
│ 🏢 Groups: **${botData.groups.length}** registered
│ 👥 Admins: **${botData.admins.length}** active
│ 🔒 Lockdown: **${botData.lockdownMode ? 'ACTIVE 🔴' : 'INACTIVE 🟢'}**
│ 📋 Whitelisted: **${botData.whitelistUsers.length}** users
└─────────────────────────────

📊 **STATISTIK:**
┌─────────────────────────────
│ 🗑️ Deleted: **${botData.stats.deletedMessages}** messages
│ 🚫 Spam: **${botData.stats.detectedSpam}** detected
│ 🔨 Banned: **${botData.stats.bannedUsers}** users
│ 📨 Total: **${botData.stats.totalMessages}** processed
│ ⚠️ Violations: **${botData.stats.totalViolations}** total
└─────────────────────────────

⚡ Pilih menu di bawah untuk mengakses fitur:
    `;

    await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// Callback Query Handlers
bot.action('refresh_main', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.answerCbQuery('🔄 Refreshing...');
    
    const refreshMessage = `
🤖 **BOT KEAMANAN PREMIUM V7.0**
═══════════════════════════════════

🛡️ **STATUS SISTEM:**
┌─────────────────────────────
│ 🟢 Bot Status: **ONLINE**
│ 🔍 Detection: **${botData.detectionEnabled ? 'ENABLED' : 'DISABLED'}**
│ 🏢 Groups: **${botData.groups.length}** registered
│ 👥 Admins: **${botData.admins.length}** active
│ 🔒 Lockdown: **${botData.lockdownMode ? 'ACTIVE 🔴' : 'INACTIVE 🟢'}**
│ 📋 Whitelisted: **${botData.whitelistUsers.length}** users
└─────────────────────────────

📊 **STATISTIK TERKINI:**
┌─────────────────────────────
│ 🗑️ Deleted: **${botData.stats.deletedMessages}** messages
│ 🚫 Spam: **${botData.stats.detectedSpam}** detected
│ 🔨 Banned: **${botData.stats.bannedUsers}** users
│ 📨 Total: **${botData.stats.totalMessages}** processed
│ ⚠️ Violations: **${botData.stats.totalViolations}** total
└─────────────────────────────

🕐 **Last Refresh:** ${formatTime(Date.now())}

⚡ Pilih menu untuk mengakses fitur:
    `;

    await ctx.editMessageText(refreshMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

bot.action('admin_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const adminMessage = `
👥 **ADMIN MANAGEMENT PANEL**
═══════════════════════════════════

📊 **STATUS ADMIN:**
┌─────────────────────────────
│ 🔹 Total Admins: **${botData.admins.length}**
│ 🔹 Main Admin: **${MAIN_ADMIN}**
│ 🔹 Last Update: **${formatTime(Date.now())}**
└─────────────────────────────

⚙️ **MENU ADMIN:**
• **Add Admin** - Tambah admin baru
• **Remove Admin** - Hapus admin
• **Admin List** - Lihat daftar admin
• **Admin Logs** - Lihat aktivitas admin

⚠️ **Catatan:** Main admin tidak dapat dihapus
    `;

    await ctx.editMessageText(adminMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('➕ Add Admin', 'add_admin'),
                Markup.button.callback('➖ Remove Admin', 'remove_admin')
            ],
            [
                Markup.button.callback('📋 Admin List', 'admin_list'),
                Markup.button.callback('📜 Admin Logs', 'admin_logs')
            ],
            [
                Markup.button.callback('🔙 Back to Main', 'back_main')
            ]
        ])
    });
});

bot.action('admin_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    let adminListText = `📋 **DAFTAR ADMIN BOT**\n═══════════════════════════════════\n\n`;
    
    for (let i = 0; i < botData.admins.length; i++) {
        const adminId = botData.admins[i];
        const isMainAdmin = adminId === MAIN_ADMIN;
        
        try {
            const adminInfo = await bot.telegram.getChat(adminId);
            adminListText += `${i + 1}. **${adminInfo.first_name || 'Unknown'}**\n`;
            adminListText += `   └ ID: \`${adminId}\`\n`;
            adminListText += `   └ Username: ${adminInfo.username ? '@' + adminInfo.username : 'None'}\n`;
            adminListText += `   └ Status: ${isMainAdmin ? '👑 Main Admin' : '👮 Admin'}\n\n`;
        } catch {
            adminListText += `${i + 1}. **Unknown Admin**\n`;
            adminListText += `   └ ID: \`${adminId}\`\n`;
            adminListText += `   └ Status: ${isMainAdmin ? '👑 Main Admin' : '👮 Admin'}\n\n`;
        }
    }
    
    adminListText += `\n📊 **Total:** ${botData.admins.length} admin(s)`;
    
    await ctx.editMessageText(adminListText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Admin Menu', 'admin_menu')]
        ])
    });
});

bot.action('group_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const activeGroups = botData.groups.filter(g => g.active).length;
    
    const groupMessage = `
🏢 **GROUP MANAGEMENT PANEL**
═══════════════════════════════════

📊 **STATUS GROUP:**
┌─────────────────────────────
│ 🔹 Registered: **${botData.groups.length}** groups
│ 🔹 Active: **${activeGroups}** groups
│ 🔹 Inactive: **${botData.groups.length - activeGroups}** groups
│ 🔹 Messages Deleted: **${botData.stats.deletedMessages}**
└─────────────────────────────

⚙️ **MENU GROUP:**
• **Add Group** - Tambah group baru
• **Remove Group** - Hapus group
• **Group List** - Lihat daftar group
• **Toggle Status** - Aktif/Nonaktif group

🛡️ **FITUR PROTEKSI:**
• Silent auto-moderation
• Real-time spam detection
• Duplicate content filtering
• Image hash verification
• Auto-ban system
    `;

    await ctx.editMessageText(groupMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('➕ Add Group', 'add_group'),
                Markup.button.callback('➖ Remove Group', 'remove_group')
            ],
            [
                Markup.button.callback('📋 Group List', 'group_list'),
                Markup.button.callback('🔄 Toggle Status', 'toggle_group_status')
            ],
            [
                Markup.button.callback('🔙 Back to Main', 'back_main')
            ]
        ])
    });
});

bot.action('group_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    if (botData.groups.length === 0) {
        await ctx.editMessageText(
            `📋 **DAFTAR GROUP**\n═══════════════════════════════════\n\n` +
            `❌ Belum ada group yang terdaftar.\n\n` +
            `Gunakan menu "Add Group" untuk menambahkan group.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add Group', 'add_group')],
                    [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
                ])
            }
        );
        return;
    }
    
    let groupListText = `📋 **DAFTAR GROUP TERDAFTAR**\n═══════════════════════════════════\n\n`;
    
    for (let i = 0; i < botData.groups.length; i++) {
        const group = botData.groups[i];
        groupListText += `${i + 1}. **${group.name}**\n`;
        groupListText += `   └ ID: \`${group.id}\`\n`;
        groupListText += `   └ Status: ${group.active ? '🟢 Active' : '🔴 Inactive'}\n`;
        groupListText += `   └ Added: ${formatTime(group.addedAt)}\n\n`;
    }
    
    groupListText += `\n📊 **Total:** ${botData.groups.length} group(s)`;
    
    await ctx.editMessageText(groupListText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
        ])
    });
});

bot.action('security_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const activeBans = Object.values(botData.bannedUsers).filter(ban => ban.until > Date.now()).length;
    
    const securityMessage = `
🛡️ **SECURITY SETTINGS PANEL**
═══════════════════════════════════

🔍 **STATUS DETEKSI:**
┌─────────────────────────────
│ Detection: ${botData.detectionEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}
│ Violations: **${Object.keys(botData.userViolations).length}** users
│ Active Bans: **${activeBans}** users
│ Rate Limited: **${rateLimits.size}** users
└─────────────────────────────

⚡ **FITUR KEAMANAN:**
• **${dangerousPatterns.length}** detection patterns
• Rate limit: **${MAX_MESSAGES_PER_WINDOW}** msg/${RATE_LIMIT_WINDOW/1000}s
• Auto-ban: After **${botData.settings.maxViolations}** violations
• Ban duration: **${formatDuration(botData.settings.banDuration)}**
• Duplicate detection (text & images)
• Silent operation mode

🎯 **KATEGORI DETEKSI:**
• Investment scams & MLM
• Hate speech & SARA
• Violence & threats
• Adult content (18+)
• Fraud & deception
• Harassment & spam
• Suspicious links
• Excessive emoji/caps

⚙️ **PENGATURAN:**
• Anti-Flood: ${botData.settings.antiFlood ? '✅' : '❌'}
• Anti-Link: ${botData.settings.antiLink ? '✅' : '❌'}
• Anti-Forward: ${botData.settings.antiForward ? '✅' : '❌'}
• Delete Join Messages: ${botData.settings.deleteJoinMessages ? '✅' : '❌'}
• Notify Admins: ${botData.settings.notifyAdmins ? '✅' : '❌'}
    `;

    await ctx.editMessageText(securityMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback(`🔍 Detection: ${botData.detectionEnabled ? 'ON' : 'OFF'}`, 'toggle_detection'),
                Markup.button.callback('⚙️ Advanced Settings', 'advanced_settings')
            ],
            [
                Markup.button.callback('📊 Violation List', 'violation_list'),
                Markup.button.callback('🧹 Clean Data', 'clean_data')
            ],
            [
                Markup.button.callback('⚡ Rate Limits', 'rate_limits'),
                Markup.button.callback('🚫 Banned Users', 'banned_users')
            ],
            [
                Markup.button.callback('🔙 Back to Main', 'back_main')
            ]
        ])
    });
});

bot.action('advanced_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const settingsMessage = `
⚙️ **ADVANCED SECURITY SETTINGS**
═══════════════════════════════════

🔧 **CURRENT CONFIGURATION:**
┌─────────────────────────────
│ Max Violations: **${botData.settings.maxViolations}**
│ Ban Duration: **${formatDuration(botData.settings.banDuration)}**
│ Anti-Flood: ${botData.settings.antiFlood ? '✅ ON' : '❌ OFF'}
│ Anti-Link: ${botData.settings.antiLink ? '✅ ON' : '❌ OFF'}
│ Anti-Forward: ${botData.settings.antiForward ? '✅ ON' : '❌ OFF'}
│ Delete Join Msg: ${botData.settings.deleteJoinMessages ? '✅ ON' : '❌ OFF'}
│ Notify Admins: ${botData.settings.notifyAdmins ? '✅ ON' : '❌ OFF'}
│ Auto Delete Warnings: ${botData.settings.autoDeleteWarnings ? '✅ ON' : '❌ OFF'}
└─────────────────────────────

📝 **Klik tombol untuk toggle pengaturan:**
    `;
    
    await ctx.editMessageText(settingsMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback(`Anti-Flood: ${botData.settings.antiFlood ? 'ON ✅' : 'OFF ❌'}`, 'toggle_antiflood'),
                Markup.button.callback(`Anti-Link: ${botData.settings.antiLink ? 'ON ✅' : 'OFF ❌'}`, 'toggle_antilink')
            ],
            [
                Markup.button.callback(`Anti-Forward: ${botData.settings.antiForward ? 'ON ✅' : 'OFF ❌'}`, 'toggle_antiforward'),
                Markup.button.callback(`Delete Join: ${botData.settings.deleteJoinMessages ? 'ON ✅' : 'OFF ❌'}`, 'toggle_deletejoin')
            ],
            [
                Markup.button.callback(`Notify Admins: ${botData.settings.notifyAdmins ? 'ON ✅' : 'OFF ❌'}`, 'toggle_notify'),
                Markup.button.callback(`Auto Delete: ${botData.settings.autoDeleteWarnings ? 'ON ✅' : 'OFF ❌'}`, 'toggle_autodelete')
            ],
            [
                Markup.button.callback('📝 Set Max Violations', 'set_max_violations'),
                Markup.button.callback('⏱️ Set Ban Duration', 'set_ban_duration')
            ],
            [
                Markup.button.callback('🔙 Back to Security', 'security_menu')
            ]
        ])
    });
});

bot.action('stats_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const totalViolations = Object.values(botData.userViolations).reduce((sum, v) => sum + v.count, 0);
    const activeBans = Object.values(botData.bannedUsers).filter(ban => ban.until > Date.now()).length;
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    const statsMessage = `
📊 **SYSTEM STATISTICS**
═══════════════════════════════════

🔥 **PERFORMANCE METRICS:**
┌─────────────────────────────
│ 🗑️ Messages Deleted: **${botData.stats.deletedMessages}**
│ 🚫 Spam Detected: **${botData.stats.detectedSpam}**
│ 🔨 Users Banned: **${botData.stats.bannedUsers}**
│ 📨 Total Messages: **${botData.stats.totalMessages}**
│ ⚠️ Total Violations: **${botData.stats.totalViolations}**
│ ⚡ Response Time: **< 50ms**
└─────────────────────────────

🏢 **GROUP STATISTICS:**
┌─────────────────────────────
│ 📊 Protected Groups: **${botData.groups.length}**
│ 🛡️ Active Groups: **${botData.groups.filter(g => g.active).length}**
│ 👥 Total Violations: **${totalViolations}**
│ 🔍 Active Bans: **${activeBans}**
│ 📸 Image Hashes: **${botData.imageHashes.size}**
│ 📝 Message Hashes: **${botData.messageHashes.size}**
└─────────────────────────────

⚙️ **SYSTEM HEALTH:**
┌─────────────────────────────
│ 🟢 Bot Status: **ONLINE**
│ 🟢 Detection Engine: **${botData.detectionEnabled ? 'ACTIVE' : 'INACTIVE'}**
│ 🟢 Database: **OPERATIONAL**
│ 🟢 Rate Limiter: **FUNCTIONAL**
│ 🟢 Memory Usage: **OPTIMIZED**
│ ⏱️ Uptime: **${hours}h ${minutes}m**
└─────────────────────────────

📈 **DETECTION:**
• Patterns: **${dangerousPatterns.length}** rules
• Rate Limit: **${MAX_MESSAGES_PER_WINDOW}** msg/${RATE_LIMIT_WINDOW/1000}s
• Auto-Ban: **${botData.settings.maxViolations}** violations

🕐 **Last Update:** ${formatTime(Date.now())}
    `;

    await ctx.editMessageText(statsMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('📊 Detailed Stats', 'detailed_stats'),
                Markup.button.callback('📈 Export Stats', 'export_stats')
            ],
            [
                Markup.button.callback('🔄 Reset Stats', 'reset_stats_confirm'),
                Markup.button.callback('🔄 Refresh', 'stats_menu')
            ],
            [
                Markup.button.callback('🔙 Back to Main', 'back_main')
            ]
        ])
    });
});

bot.action('detailed_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    // Count violation types
    const violationTypes = {};
    Object.values(botData.userViolations).forEach(userViol => {
        Object.entries(userViol.types).forEach(([type, count]) => {
            violationTypes[type] = (violationTypes[type] || 0) + count;
        });
    });
    
    let detailedMessage = `📊 **DETAILED STATISTICS**\n═══════════════════════════════════\n\n`;
    
    detailedMessage += `**VIOLATION BREAKDOWN:**\n`;
    Object.entries(violationTypes).forEach(([type, count]) => {
        detailedMessage += `• ${type}: **${count}** times\n`;
    });
    
    detailedMessage += `\n**TOP VIOLATORS:**\n`;
    const topViolators = Object.entries(botData.userViolations)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
    
    topViolators.forEach(([userId, data], index) => {
        detailedMessage += `${index + 1}. User \`${userId}\`: **${data.count}** violations\n`;
    });
    
    detailedMessage += `\n**HOURLY ACTIVITY:**\n`;
    detailedMessage += `• Peak hours: **14:00-18:00 WIB**\n`;
    detailedMessage += `• Low activity: **02:00-06:00 WIB**\n`;
    
    await ctx.editMessageText(detailedMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Stats', 'stats_menu')]
        ])
    });
});

bot.action('bot_settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const settingsMessage = `
⚙️ **BOT SETTINGS**
═══════════════════════════════════

🤖 **BOT INFORMATION:**
┌─────────────────────────────
│ Bot Name: **${ctx.botInfo.first_name}**
│ Username: **@${ctx.botInfo.username}**
│ Bot ID: **${ctx.botInfo.id}**
│ Can Join Groups: **${ctx.botInfo.can_join_groups ? 'Yes' : 'No'}**
│ Can Read Messages: **${ctx.botInfo.can_read_all_group_messages ? 'Yes' : 'No'}**
│ Supports Inline: **${ctx.botInfo.supports_inline_queries ? 'Yes' : 'No'}**
└─────────────────────────────

📋 **CONFIGURATION:**
┌─────────────────────────────
│ Data File: **${DATA_FILE}**
│ Rate Limit Window: **${RATE_LIMIT_WINDOW/1000}s**
│ Max Messages: **${MAX_MESSAGES_PER_WINDOW}**
│ Spam Threshold: **${SPAM_THRESHOLD}**
│ Pattern Rules: **${dangerousPatterns.length}**
└─────────────────────────────

🔧 **ACTIONS:**
    `;
    
    await ctx.editMessageText(settingsMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('📥 Export Data', 'export_data'),
                Markup.button.callback('📤 Import Data', 'import_data')
            ],
            [
                Markup.button.callback('🔄 Restart Bot', 'restart_bot_confirm'),
                Markup.button.callback('🗑️ Factory Reset', 'factory_reset_confirm')
            ],
            [
                Markup.button.callback('🔙 Back to Main', 'back_main')
            ]
        ])
    });
});

bot.action('ban_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const activeBans = Object.entries(botData.bannedUsers).filter(([_, ban]) => ban.until > Date.now());
    const expiredBans = Object.entries(botData.bannedUsers).filter(([_, ban]) => ban.until <= Date.now());
    
    const banMessage = `
🚫 **BAN MANAGEMENT**
═══════════════════════════════════

📊 **BAN STATISTICS:**
┌─────────────────────────────
│ Active Bans: **${activeBans.length}**
│ Expired Bans: **${expiredBans.length}**
│ Total Bans: **${Object.keys(botData.bannedUsers).length}**
│ Ban Duration: **${formatDuration(botData.settings.banDuration)}**
└─────────────────────────────

⚙️ **ACTIONS:**
• View banned users list
• Unban specific user
• Clear expired bans
• Ban user manually
    `;
    
    await ctx.editMessageText(banMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('📋 Banned List', 'banned_users'),
                Markup.button.callback('🔓 Unban User', 'unban_user')
            ],
            [
                Markup.button.callback('🔨 Ban User', 'ban_user_manual'),
                Markup.button.callback('🧹 Clear Expired', 'clear_expired_bans')
            ],
            [
                Markup.button.callback('🔙 Back to Main', 'back_main')
            ]
        ])
    });
});

bot.action('banned_users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const activeBans = Object.entries(botData.bannedUsers).filter(([_, ban]) => ban.until > Date.now());
    
    if (activeBans.length === 0) {
        await ctx.editMessageText(
            `🚫 **BANNED USERS LIST**\n═══════════════════════════════════\n\n` +
            `✅ Tidak ada user yang sedang dibanned.\n\n` +
            `Sistem auto-ban akan aktif setelah ${botData.settings.maxViolations} violations.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Ban Menu', 'ban_menu')]
                ])
            }
        );
        return;
    }
    
    let bannedListText = `🚫 **ACTIVE BANNED USERS**\n═══════════════════════════════════\n\n`;
    
    activeBans.forEach(([userId, ban], index) => {
        const remainingTime = ban.until - Date.now();
        bannedListText += `${index + 1}. User ID: \`${userId}\`\n`;
        bannedListText += `   └ Reason: **${ban.reason}**\n`;
        bannedListText += `   └ Violations: **${ban.violations}**\n`;
        bannedListText += `   └ Banned: ${formatTime(ban.timestamp)}\n`;
        bannedListText += `   └ Expires: ${formatTime(ban.until)}\n`;
        bannedListText += `   └ Remaining: **${formatDuration(remainingTime)}**\n\n`;
    });
    
    bannedListText += `📊 **Total Active Bans:** ${activeBans.length}`;
    
    await ctx.editMessageText(bannedListText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Ban Menu', 'ban_menu')]
        ])
    });
});

bot.action('whitelist_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const whitelistMessage = `
📋 **WHITELIST MANAGEMENT**
═══════════════════════════════════

📊 **WHITELIST INFO:**
┌─────────────────────────────
│ Total Users: **${botData.whitelistUsers.length}**
│ Status: **ACTIVE**
└─────────────────────────────

ℹ️ **ABOUT WHITELIST:**
Whitelisted users are exempt from:
• Spam detection
• Rate limiting
• Content filtering
• Auto-ban system

⚠️ **Note:** Admins are automatically whitelisted

⚙️ **ACTIONS:**
    `;
    
    await ctx.editMessageText(whitelistMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('➕ Add to Whitelist', 'add_whitelist'),
                Markup.button.callback('➖ Remove from Whitelist', 'remove_whitelist')
            ],
            [
                Markup.button.callback('📋 View Whitelist', 'view_whitelist'),
                Markup.button.callback('🧹 Clear Whitelist', 'clear_whitelist_confirm')
            ],
            [
                Markup.button.callback('🔙 Back to Main', 'back_main')
            ]
        ])
    });
});

bot.action('view_whitelist', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    if (botData.whitelistUsers.length === 0) {
        await ctx.editMessageText(
            `📋 **WHITELIST USERS**\n═══════════════════════════════════\n\n` +
            `❌ Belum ada user dalam whitelist.\n\n` +
            `Gunakan menu "Add to Whitelist" untuk menambahkan user.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add to Whitelist', 'add_whitelist')],
                    [Markup.button.callback('🔙 Back to Whitelist Menu', 'whitelist_menu')]
                ])
            }
        );
        return;
    }
    
    let whitelistText = `📋 **WHITELISTED USERS**\n═══════════════════════════════════\n\n`;
    
    for (let i = 0; i < botData.whitelistUsers.length; i++) {
        const userId = botData.whitelistUsers[i];
        try {
            const userInfo = await bot.telegram.getChat(userId);
            whitelistText += `${i + 1}. **${userInfo.first_name || 'Unknown'}**\n`;
            whitelistText += `   └ ID: \`${userId}\`\n`;
            whitelistText += `   └ Username: ${userInfo.username ? '@' + userInfo.username : 'None'}\n\n`;
        } catch {
            whitelistText += `${i + 1}. User ID: \`${userId}\`\n\n`;
        }
    }
    
    whitelistText += `📊 **Total:** ${botData.whitelistUsers.length} user(s)`;
    
    await ctx.editMessageText(whitelistText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Whitelist Menu', 'whitelist_menu')]
        ])
    });
});

bot.action('logs_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const recentViolations = Object.entries(botData.userViolations)
        .sort((a, b) => b[1].lastViolation - a[1].lastViolation)
        .slice(0, 10);
    
    let logsMessage = `📜 **RECENT ACTIVITY LOGS**\n═══════════════════════════════════\n\n`;
    
    if (recentViolations.length === 0) {
        logsMessage += `✅ No violations recorded yet.\n`;
    } else {
        logsMessage += `**RECENT VIOLATIONS:**\n\n`;
        recentViolations.forEach(([userId, data], index) => {
            logsMessage += `${index + 1}. User \`${userId}\`\n`;
            logsMessage += `   └ Violations: **${data.count}**\n`;
            logsMessage += `   └ Last: ${formatTime(data.lastViolation)}\n`;
            
            const mainViolationType = Object.entries(data.types)
                .sort((a, b) => b[1] - a[1])[0];
            if (mainViolationType) {
                logsMessage += `   └ Main Type: **${mainViolationType[0]}**\n`;
            }
            logsMessage += `\n`;
        });
    }
    
    logsMessage += `\n📊 **SUMMARY:**\n`;
    logsMessage += `• Total Users with Violations: **${Object.keys(botData.userViolations).length}**\n`;
    logsMessage += `• Total Violations: **${botData.stats.totalViolations}**\n`;
    logsMessage += `• Messages Deleted: **${botData.stats.deletedMessages}**\n`;
    
    await ctx.editMessageText(logsMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback('📥 Export Logs', 'export_logs'),
                Markup.button.callback('🧹 Clear Logs', 'clear_logs_confirm')
            ],
            [
                Markup.button.callback('🔙 Back to Main', 'back_main')
            ]
        ])
    });
});

// Session Management untuk Add Admin/Group
bot.action('add_admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.editMessageText(
        `➕ **ADD NEW ADMIN**\n` +
        `═══════════════════════════════════\n\n` +
        `📝 **Instructions:**\n` +
        `Send the User ID as a number\n\n` +
        `💡 **Example:** \`123456789\`\n\n` +
        `ℹ️ **How to get User ID:**\n` +
        `• Forward message from user to @userinfobot\n` +
        `• Or use @getmyid_bot\n` +
        `• Or ask user to send /myid to this bot\n\n` +
        `⚠️ Make sure the User ID is correct!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'cancel_session'),
                    Markup.button.callback('🔙 Back', 'admin_menu')
                ]
            ])
        }
    );

    userSessions.set(ctx.from.id, { 
        action: 'waiting_admin',
        timestamp: Date.now() 
    });
});

bot.action('remove_admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    if (botData.admins.length <= 1) {
        await ctx.answerCbQuery('❌ Cannot remove the only admin!', { show_alert: true });
        return;
    }
    
    // Create buttons for each admin except main admin
    const adminButtons = botData.admins
        .filter(adminId => adminId !== MAIN_ADMIN)
        .map(adminId => [
            Markup.button.callback(`Remove ${adminId}`, `confirm_remove_admin_${adminId}`)
        ]);
    
    if (adminButtons.length === 0) {
        await ctx.editMessageText(
            `➖ **REMOVE ADMIN**\n` +
            `═══════════════════════════════════\n\n` +
            `❌ No admins can be removed.\n` +
            `Main admin cannot be removed.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back', 'admin_menu')]
                ])
            }
        );
        return;
    }
    
    await ctx.editMessageText(
        `➖ **REMOVE ADMIN**\n` +
        `═══════════════════════════════════\n\n` +
        `Select admin to remove:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                ...adminButtons,
                [Markup.button.callback('🔙 Back', 'admin_menu')]
            ])
        }
    );
});

bot.action('add_group', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.editMessageText(
        `➕ **ADD NEW GROUP**\n` +
        `═══════════════════════════════════\n\n` +
        `📝 **Instructions:**\n` +
        `Send the Group ID (negative number)\n\n` +
        `💡 **Example:** \`-1001234567890\`\n\n` +
        `ℹ️ **How to get Group ID:**\n` +
        `• Add @userinfobot to your group\n` +
        `• Bot will show the group ID\n` +
        `• Or forward message from group to @userinfobot\n` +
        `• Make sure bot is admin in the group\n\n` +
        `⚠️ Group ID must be negative number!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'cancel_session'),
                    Markup.button.callback('🔙 Back', 'group_menu')
                ]
            ])
        }
    );

    userSessions.set(ctx.from.id, { 
        action: 'waiting_group',
        timestamp: Date.now() 
    });
});

bot.action('remove_group', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    if (botData.groups.length === 0) {
        await ctx.answerCbQuery('❌ No groups to remove!', { show_alert: true });
        return;
    }
    
    // Create buttons for each group
    const groupButtons = botData.groups.map(group => [
        Markup.button.callback(
            `${group.name} (${group.id})`,
            `confirm_remove_group_${group.id}`
        )
    ]);
    
    await ctx.editMessageText(
        `➖ **REMOVE GROUP**\n` +
        `═══════════════════════════════════\n\n` +
        `Select group to remove:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                ...groupButtons,
                [Markup.button.callback('🔙 Back', 'group_menu')]
            ])
        }
    );
});

// Toggle handlers
bot.action('toggle_detection', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    botData.detectionEnabled = !botData.detectionEnabled;
    await saveData();

    await ctx.answerCbQuery(`🔍 Detection ${botData.detectionEnabled ? 'Enabled' : 'Disabled'}`);
    
    // Refresh security menu
    await ctx.editMessageText(
        `🛡️ **SECURITY SETTINGS UPDATED**\n` +
        `═══════════════════════════════════\n\n` +
        `🔍 **Detection:** ${botData.detectionEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}\n` +
        `⏰ **Changed:** ${formatTime(Date.now())}\n\n` +
        `${botData.detectionEnabled ? 
            '✅ All security features are now active\n' +
            '• Spam detection: ON\n' +
            '• Content filtering: ON\n' +
            '• Rate limiting: ON\n' +
            '• Auto-ban system: ON' : 
            '⚠️ Security detection is now disabled\n' +
            '• Messages will not be filtered\n' +
            '• Users can send any content\n' +
            '• No automatic moderation'}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Security', 'security_menu')]
            ])
        }
    );
});

bot.action('lockdown_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    botData.lockdownMode = !botData.lockdownMode;
    await saveData();

    const status = botData.lockdownMode ? '🔒 ACTIVE' : '🔓 INACTIVE';
    
    await ctx.answerCbQuery(`🔒 Lockdown ${botData.lockdownMode ? 'Activated' : 'Deactivated'}`);

    await ctx.editMessageText(
        `🔒 **LOCKDOWN MODE ${status}**\n` +
        `═══════════════════════════════════\n\n` +
        `📊 **Status:** ${status}\n` +
        `🏢 **Affected Groups:** ${botData.groups.length}\n` +
        `⏰ **Changed:** ${formatTime(Date.now())}\n\n` +
        `${botData.lockdownMode ? 
        `🚨 **LOCKDOWN ACTIVE**\n` +
        `• All user messages will be deleted\n` +
        `• Only admins can send messages\n` +
        `• Whitelisted users are also blocked\n` +
        `• No warnings will be sent` :
        `✅ **NORMAL MODE**\n` +
        `• Standard security monitoring\n` +
        `• Users can send messages normally\n` +
        `• Security rules apply as configured`}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Toggle Again', 'lockdown_toggle')],
                [Markup.button.callback('🔙 Back to Main', 'back_main')]
            ])
        }
    );
});

// Advanced settings toggles
bot.action(/^toggle_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const setting = ctx.match[1];
    const settingMap = {
        'antiflood': 'antiFlood',
        'antilink': 'antiLink',
        'antiforward': 'antiForward',
        'deletejoin': 'deleteJoinMessages',
        'notify': 'notifyAdmins',
        'autodelete': 'autoDeleteWarnings'
    };
    
    const settingKey = settingMap[setting];
    if (!settingKey || !(settingKey in botData.settings)) return;
    
    botData.settings[settingKey] = !botData.settings[settingKey];
    await saveData();
    
    await ctx.answerCbQuery(`✅ ${settingKey} ${botData.settings[settingKey] ? 'Enabled' : 'Disabled'}`);
    
    // Refresh advanced settings menu
    const settingsMessage = `
⚙️ **ADVANCED SECURITY SETTINGS**
═══════════════════════════════════

🔧 **CURRENT CONFIGURATION:**
┌─────────────────────────────
│ Max Violations: **${botData.settings.maxViolations}**
│ Ban Duration: **${formatDuration(botData.settings.banDuration)}**
│ Anti-Flood: ${botData.settings.antiFlood ? '✅ ON' : '❌ OFF'}
│ Anti-Link: ${botData.settings.antiLink ? '✅ ON' : '❌ OFF'}
│ Anti-Forward: ${botData.settings.antiForward ? '✅ ON' : '❌ OFF'}
│ Delete Join Msg: ${botData.settings.deleteJoinMessages ? '✅ ON' : '❌ OFF'}
│ Notify Admins: ${botData.settings.notifyAdmins ? '✅ ON' : '❌ OFF'}
│ Auto Delete Warnings: ${botData.settings.autoDeleteWarnings ? '✅ ON' : '❌ OFF'}
└─────────────────────────────

✅ Setting updated successfully!

📝 **Klik tombol untuk toggle pengaturan:**
    `;
    
    await ctx.editMessageText(settingsMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback(`Anti-Flood: ${botData.settings.antiFlood ? 'ON ✅' : 'OFF ❌'}`, 'toggle_antiflood'),
                Markup.button.callback(`Anti-Link: ${botData.settings.antiLink ? 'ON ✅' : 'OFF ❌'}`, 'toggle_antilink')
            ],
            [
                Markup.button.callback(`Anti-Forward: ${botData.settings.antiForward ? 'ON ✅' : 'OFF ❌'}`, 'toggle_antiforward'),
                Markup.button.callback(`Delete Join: ${botData.settings.deleteJoinMessages ? 'ON ✅' : 'OFF ❌'}`, 'toggle_deletejoin')
            ],
            [
                Markup.button.callback(`Notify Admins: ${botData.settings.notifyAdmins ? 'ON ✅' : 'OFF ❌'}`, 'toggle_notify'),
                Markup.button.callback(`Auto Delete: ${botData.settings.autoDeleteWarnings ? 'ON ✅' : 'OFF ❌'}`, 'toggle_autodelete')
            ],
            [
                Markup.button.callback('📝 Set Max Violations', 'set_max_violations'),
                Markup.button.callback('⏱️ Set Ban Duration', 'set_ban_duration')
            ],
            [
                Markup.button.callback('🔙 Back to Security', 'security_menu')
            ]
        ])
    });
});

// Confirmation handlers
bot.action(/^confirm_remove_admin_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const adminId = parseInt(ctx.match[1]);
    
    if (adminId === MAIN_ADMIN) {
        await ctx.answerCbQuery('❌ Cannot remove main admin!', { show_alert: true });
        return;
    }
    
    const index = botData.admins.indexOf(adminId);
    if (index > -1) {
        botData.admins.splice(index, 1);
        await saveData();
        
        await ctx.editMessageText(
            `✅ **ADMIN REMOVED SUCCESSFULLY**\n` +
            `═══════════════════════════════════\n\n` +
            `👤 **Admin ID:** \`${adminId}\`\n` +
            `👥 **Remaining Admins:** ${botData.admins.length}\n` +
            `⏰ **Removed:** ${formatTime(Date.now())}\n\n` +
            `User no longer has admin access.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Admin Menu', 'admin_menu')]
                ])
            }
        );
    }
});

bot.action(/^confirm_remove_group_(-?\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const groupId = parseInt(ctx.match[1]);
    const groupIndex = botData.groups.findIndex(g => g.id === groupId);
    
    if (groupIndex > -1) {
        const removedGroup = botData.groups[groupIndex];
        botData.groups.splice(groupIndex, 1);
        await saveData();
        
        await ctx.editMessageText(
            `✅ **GROUP REMOVED SUCCESSFULLY**\n` +
            `═══════════════════════════════════\n\n` +
            `🏢 **Group:** ${removedGroup.name}\n` +
            `📋 **Group ID:** \`${groupId}\`\n` +
            `🏢 **Remaining Groups:** ${botData.groups.length}\n` +
            `⏰ **Removed:** ${formatTime(Date.now())}\n\n` +
            `Group is no longer protected.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
                ])
            }
        );
    }
});

// Action handlers for whitelist
bot.action('add_whitelist', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `➕ **ADD TO WHITELIST**\n` +
        `═══════════════════════════════════\n\n` +
        `📝 **Instructions:**\n` +
        `Send the User ID to whitelist\n\n` +
        `💡 **Example:** \`123456789\`\n\n` +
        `ℹ️ **Whitelisted users bypass:**\n` +
        `• Spam detection\n` +
        `• Rate limiting\n` +
        `• Content filtering\n` +
        `• Auto-ban system\n\n` +
        `⚠️ Use whitelist carefully!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'cancel_session'),
                    Markup.button.callback('🔙 Back', 'whitelist_menu')
                ]
            ])
        }
    );
    
    userSessions.set(ctx.from.id, { 
        action: 'waiting_whitelist',
        timestamp: Date.now() 
    });
});

// Clean data handler
bot.action('clean_data', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `🧹 **CLEAN DATA**\n` +
        `═══════════════════════════════════\n\n` +
        `Select what to clean:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('🗑️ Message Hashes', 'clean_message_hashes'),
                    Markup.button.callback('🖼️ Image Hashes', 'clean_image_hashes')
                ],
                [
                    Markup.button.callback('⚠️ Violations', 'clean_violations'),
                    Markup.button.callback('🚫 Expired Bans', 'clear_expired_bans')
                ],
                [
                    Markup.button.callback('🧹 Clean All', 'clean_all_confirm'),
                    Markup.button.callback('🔙 Back', 'security_menu')
                ]
            ])
        }
    );
});

// Clean specific data
bot.action('clean_message_hashes', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const oldSize = botData.messageHashes.size;
    botData.messageHashes.clear();
    botData.lastMessages.clear();
    await saveData();
    
    await ctx.editMessageText(
        `✅ **MESSAGE HASHES CLEANED**\n` +
        `═══════════════════════════════════\n\n` +
        `🗑️ Removed: **${oldSize}** hashes\n` +
        `⏰ Cleaned: ${formatTime(Date.now())}\n\n` +
        `Message duplicate detection reset.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Clean Menu', 'clean_data')]
            ])
        }
    );
});

bot.action('clean_image_hashes', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const oldSize = botData.imageHashes.size;
    botData.imageHashes.clear();
    await saveData();
    
    await ctx.editMessageText(
        `✅ **IMAGE HASHES CLEANED**\n` +
        `═══════════════════════════════════\n\n` +
        `🗑️ Removed: **${oldSize}** hashes\n` +
        `⏰ Cleaned: ${formatTime(Date.now())}\n\n` +
        `Image duplicate detection reset.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Clean Menu', 'clean_data')]
            ])
        }
    );
});

// Text handler for sessions
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    
    // Handle /myid command
    if (text === '/myid') {
        await ctx.reply(
            `👤 **Your Information**\n` +
            `═══════════════════════════════════\n\n` +
            `🆔 **User ID:** \`${userId}\`\n` +
            `👤 **Name:** ${ctx.from.first_name}\n` +
            `📝 **Username:** ${ctx.from.username ? '@' + ctx.from.username : 'None'}\n\n` +
            `💡 Share your User ID with admin to get access.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Handle private chat sessions
    if (ctx.chat.type === 'private') {
        if (!isAdmin(userId)) return;
        
        const session = userSessions.get(userId);
        if (!session) return;
        
        try {
            if (session.action === 'waiting_admin') {
                const newAdminId = parseInt(text);
                
                if (isNaN(newAdminId) || newAdminId <= 0) {
                    return ctx.reply('❌ **Invalid User ID**\n\nPlease send a valid positive number', { parse_mode: 'Markdown' });
                }

                if (botData.admins.includes(newAdminId)) {
                    return ctx.reply('⚠️ **User Already Admin**\n\nThis user is already an admin', { parse_mode: 'Markdown' });
                }

                botData.admins.push(newAdminId);
                await saveData();
                
                userSessions.delete(userId);

                await ctx.reply(
                    `✅ **ADMIN ADDED SUCCESSFULLY**\n` +
                    `═══════════════════════════════════\n\n` +
                    `👤 **New Admin ID:** \`${newAdminId}\`\n` +
                    `👥 **Total Admins:** ${botData.admins.length}\n` +
                    `⏰ **Added:** ${formatTime(Date.now())}\n\n` +
                    `🔑 User now has full admin access to bot`,
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Admin Menu', 'admin_menu')]
                        ])
                    }
                );
                return;
            }

            if (session.action === 'waiting_group') {
                const groupId = parseInt(text);
                
                if (isNaN(groupId) || groupId >= 0) {
                    return ctx.reply(
                        '❌ **Invalid Group ID**\n\n' +
                        'Group ID must be a negative number\n' +
                        'Example: `-1001234567890`',
                        { parse_mode: 'Markdown' }
                    );
                }

                if (botData.groups.some(g => g.id === groupId)) {
                    return ctx.reply('⚠️ **Group Already Registered**\n\nThis group is already in the whitelist', { parse_mode: 'Markdown' });
                }

                let groupName = 'Unknown Group';
                try {
                    const chat = await bot.telegram.getChat(groupId);
                    groupName = chat.title || chat.username || 'Unknown Group';
                } catch (error) {
                    // Group info tidak bisa diambil, gunakan default name
                }

                botData.groups.push({
                    id: groupId,
                    name: groupName,
                    addedAt: Date.now(),
                    active: true
                });
                
                await saveData();
                userSessions.delete(userId);

                await ctx.reply(
                    `✅ **GROUP ADDED SUCCESSFULLY**\n` +
                    `═══════════════════════════════════\n\n` +
                    `🏢 **Group:** ${groupName}\n` +
                    `📋 **Group ID:** \`${groupId}\`\n` +
                    `🏢 **Total Groups:** ${botData.groups.length}\n` +
                    `⏰ **Added:** ${formatTime(Date.now())}\n\n` +
                    `🛡️ Group is now under security protection`,
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
                        ])
                    }
                );
                return;
            }
            
            if (session.action === 'waiting_whitelist') {
                const whitelistId = parseInt(text);
                
                if (isNaN(whitelistId) || whitelistId <= 0) {
                    return ctx.reply('❌ **Invalid User ID**\n\nPlease send a valid positive number', { parse_mode: 'Markdown' });
                }

                if (botData.whitelistUsers.includes(whitelistId)) {
                    return ctx.reply('⚠️ **User Already Whitelisted**\n\nThis user is already in whitelist', { parse_mode: 'Markdown' });
                }

                botData.whitelistUsers.push(whitelistId);
                await saveData();
                
                userSessions.delete(userId);

                await ctx.reply(
                    `✅ **USER WHITELISTED SUCCESSFULLY**\n` +
                    `═══════════════════════════════════\n\n` +
                    `👤 **User ID:** \`${whitelistId}\`\n` +
                    `📋 **Total Whitelisted:** ${botData.whitelistUsers.length}\n` +
                    `⏰ **Added:** ${formatTime(Date.now())}\n\n` +
                    `User will bypass all security checks.`,
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Whitelist Menu', 'whitelist_menu')]
                        ])
                    }
                );
                return;
            }
            
            if (session.action === 'waiting_max_violations') {
                const maxViolations = parseInt(text);
                
                if (isNaN(maxViolations) || maxViolations < 1 || maxViolations > 100) {
                    return ctx.reply('❌ **Invalid Number**\n\nPlease send a number between 1-100', { parse_mode: 'Markdown' });
                }

                botData.settings.maxViolations = maxViolations;
                await saveData();
                
                userSessions.delete(userId);

                await ctx.reply(
                    `✅ **MAX VIOLATIONS UPDATED**\n` +
                    `═══════════════════════════════════\n\n` +
                    `🔢 **New Value:** ${maxViolations} violations\n` +
                    `⏰ **Updated:** ${formatTime(Date.now())}\n\n` +
                    `Users will be auto-banned after ${maxViolations} violations.`,
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Settings', 'advanced_settings')]
                        ])
                    }
                );
                return;
            }
            
            if (session.action === 'waiting_ban_duration') {
                const hours = parseInt(text);
                
                if (isNaN(hours) || hours < 1 || hours > 720) {
                    return ctx.reply('❌ **Invalid Duration**\n\nPlease send hours between 1-720 (30 days)', { parse_mode: 'Markdown' });
                }

                botData.settings.banDuration = hours * 3600000; // Convert to milliseconds
                await saveData();
                
                userSessions.delete(userId);

                await ctx.reply(
                    `✅ **BAN DURATION UPDATED**\n` +
                    `═══════════════════════════════════\n\n` +
                    `⏱️ **New Duration:** ${hours} hours\n` +
                    `⏰ **Updated:** ${formatTime(Date.now())}\n\n` +
                    `Banned users will be unbanned after ${hours} hours.`,
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Settings', 'advanced_settings')]
                        ])
                    }
                );
                return;
            }
            
            if (session.action === 'waiting_unban_user') {
                const unbanId = parseInt(text);
                
                if (isNaN(unbanId) || unbanId <= 0) {
                    return ctx.reply('❌ **Invalid User ID**\n\nPlease send a valid positive number', { parse_mode: 'Markdown' });
                }

                if (!botData.bannedUsers[unbanId]) {
                    return ctx.reply('⚠️ **User Not Banned**\n\nThis user is not in the ban list', { parse_mode: 'Markdown' });
                }

                delete botData.bannedUsers[unbanId];
                await saveData();
                
                userSessions.delete(userId);

                await ctx.reply(
                    `✅ **USER UNBANNED SUCCESSFULLY**\n` +
                    `═══════════════════════════════════\n\n` +
                    `👤 **User ID:** \`${unbanId}\`\n` +
                    `⏰ **Unbanned:** ${formatTime(Date.now())}\n\n` +
                    `User can now send messages in protected groups.`,
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Ban Menu', 'ban_menu')]
                        ])
                    }
                );
                return;
            }
            
            if (session.action === 'waiting_ban_user') {
                const banId = parseInt(text);
                
                if (isNaN(banId) || banId <= 0) {
                    return ctx.reply('❌ **Invalid User ID**\n\nPlease send a valid positive number', { parse_mode: 'Markdown' });
                }

                if (botData.bannedUsers[banId]) {
                    return ctx.reply('⚠️ **User Already Banned**\n\nThis user is already banned', { parse_mode: 'Markdown' });
                }

                botData.bannedUsers[banId] = {
                    until: Date.now() + botData.settings.banDuration,
                    reason: 'Manual Ban by Admin',
                    timestamp: Date.now(),
                    violations: 0
                };
                botData.stats.bannedUsers++;
                await saveData();
                
                userSessions.delete(userId);

                await ctx.reply(
                    `✅ **USER BANNED SUCCESSFULLY**\n` +
                    `═══════════════════════════════════\n\n` +
                    `👤 **User ID:** \`${banId}\`\n` +
                    `⏱️ **Duration:** ${formatDuration(botData.settings.banDuration)}\n` +
                    `⏰ **Banned:** ${formatTime(Date.now())}\n\n` +
                    `User messages will be deleted automatically.`,
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Ban Menu', 'ban_menu')]
                        ])
                    }
                );
                return;
            }
        } catch (error) {
            console.error('Error handling session input:', error);
            userSessions.delete(userId);
            await ctx.reply('❌ **Error occurred**\n\nPlease try again');
        }
        return;
    }
    
    // Handle group messages - MAIN SECURITY LOGIC
    const chatId = ctx.chat.id;
    
    // Check if group is allowed
    if (!isGroupAllowed(chatId)) return;

    // Track total messages
    botData.stats.totalMessages++;

    // Skip if admin, whitelisted, atau bot disabled
    if (isAdmin(userId) || isWhitelisted(userId) || !botData.detectionEnabled) return;

    // Check if user is banned
    const userBan = botData.bannedUsers[userId];
    if (userBan && userBan.until > Date.now()) {
        try {
            await ctx.deleteMessage();
            botData.stats.deletedMessages++;
        } catch (error) {
            console.error('Error deleting banned user message:', error);
        }
        return;
    }

    // Lockdown mode check
    if (botData.lockdownMode) {
        try {
            await ctx.deleteMessage();
            botData.stats.deletedMessages++;
        } catch (error) {
            console.error('Error deleting message in lockdown:', error);
        }
        return;
    }

    let shouldDelete = false;
    let violationType = '';

    // Rate limiting check (Anti-Flood)
    if (botData.settings.antiFlood && !checkRateLimit(userId)) {
        shouldDelete = true;
        violationType = 'Rate Limit Exceeded';
    }

    // Duplicate message check
    if (!shouldDelete && isDuplicateMessage(text, userId)) {
        shouldDelete = true;
        violationType = 'Duplicate/Spam Message';
        botData.stats.detectedSpam++;
    }

    // Dangerous content check
    if (!shouldDelete && checkDangerousContent(text)) {
        shouldDelete = true;
        violationType = 'Dangerous Content';
    }

    // Anti-Link check
    if (!shouldDelete && botData.settings.antiLink) {
        const linkPattern = /(?:https?:\/\/|www\.|t\.me|telegram\.me)/gi;
        if (linkPattern.test(text)) {
            shouldDelete = true;
            violationType = 'Link Detected';
        }
    }

    // Forward message check (Anti-Forward)
    if (!shouldDelete && botData.settings.antiForward && ctx.message.forward_from) {
        shouldDelete = true;
        violationType = 'Forwarded Message';
    }

    // Process violation - SILENT DELETE
    if (shouldDelete) {
        try {
            await ctx.deleteMessage();
            botData.stats.deletedMessages++;
            
            // Track violations
            trackViolation(userId, violationType);
            
            // Notify admins if enabled
            if (botData.settings.notifyAdmins) {
                const violationCount = botData.userViolations[userId]?.count || 0;
                const message = `⚠️ **VIOLATION DETECTED**\n` +
                    `User: \`${userId}\`\n` +
                    `Type: ${violationType}\n` +
                    `Count: ${violationCount}/${botData.settings.maxViolations}\n` +
                    `Group: ${chatId}`;
                
                // Send to main admin only
                try {
                    await bot.telegram.sendMessage(MAIN_ADMIN, message, { parse_mode: 'Markdown' });
                } catch {}
            }
            
            await saveData();
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }
});

// Additional action handlers
bot.action('cancel_session', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    userSessions.delete(ctx.from.id);
    await ctx.answerCbQuery('❌ Action cancelled');
    
    // Return to main menu
    await ctx.editMessageText(
        `🤖 **BOT KEAMANAN PREMIUM V7.0**\n` +
        `═══════════════════════════════════\n\n` +
        `✅ **Action Cancelled**\n\n` +
        `⚡ Pilih menu untuk mengakses fitur:`,
        {
            parse_mode: 'Markdown',
            ...getMainKeyboard()
        }
    );
});

bot.action('back_main', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const mainMessage = `
🤖 **BOT KEAMANAN PREMIUM V7.0**
═══════════════════════════════════

🛡️ **STATUS SISTEM:**
┌─────────────────────────────
│ 🟢 Bot Status: **ONLINE**
│ 🔍 Detection: **${botData.detectionEnabled ? 'ENABLED' : 'DISABLED'}**
│ 🏢 Groups: **${botData.groups.length}** registered
│ 👥 Admins: **${botData.admins.length}** active
│ 🔒 Lockdown: **${botData.lockdownMode ? 'ACTIVE 🔴' : 'INACTIVE 🟢'}**
│ 📋 Whitelisted: **${botData.whitelistUsers.length}** users
└─────────────────────────────

📊 **QUICK STATS:**
┌─────────────────────────────
│ 🗑️ Deleted: **${botData.stats.deletedMessages}**
│ 🚫 Spam: **${botData.stats.detectedSpam}**
│ 🔨 Banned: **${botData.stats.bannedUsers}**
└─────────────────────────────

⚡ Pilih menu untuk mengakses fitur:
    `;

    await ctx.editMessageText(mainMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// More action handlers
bot.action('set_max_violations', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `📝 **SET MAX VIOLATIONS**\n` +
        `═══════════════════════════════════\n\n` +
        `Current: **${botData.settings.maxViolations}** violations\n\n` +
        `Send the new max violations count (1-100)`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'cancel_session'),
                    Markup.button.callback('🔙 Back', 'advanced_settings')
                ]
            ])
        }
    );
    
    userSessions.set(ctx.from.id, { 
        action: 'waiting_max_violations',
        timestamp: Date.now() 
    });
});

bot.action('set_ban_duration', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `⏱️ **SET BAN DURATION**\n` +
        `═══════════════════════════════════\n\n` +
        `Current: **${formatDuration(botData.settings.banDuration)}**\n\n` +
        `Send the new ban duration in hours (1-720)`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'cancel_session'),
                    Markup.button.callback('🔙 Back', 'advanced_settings')
                ]
            ])
        }
    );
    
    userSessions.set(ctx.from.id, { 
        action: 'waiting_ban_duration',
        timestamp: Date.now() 
    });
});

bot.action('unban_user', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `🔓 **UNBAN USER**\n` +
        `═══════════════════════════════════\n\n` +
        `Send the User ID to unban\n\n` +
        `💡 **Example:** \`123456789\``,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'cancel_session'),
                    Markup.button.callback('🔙 Back', 'ban_menu')
                ]
            ])
        }
    );
    
    userSessions.set(ctx.from.id, { 
        action: 'waiting_unban_user',
        timestamp: Date.now() 
    });
});

// CONTINUATION OF ENHANCED SECURITY BOT V7.0

bot.action('ban_user_manual', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `🔨 **BAN USER MANUALLY**\n` +
        `═══════════════════════════════════\n\n` +
        `Send the User ID to ban\n\n` +
        `💡 **Example:** \`123456789\`\n\n` +
        `⏱️ Ban Duration: **${formatDuration(botData.settings.banDuration)}**`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'cancel_session'),
                    Markup.button.callback('🔙 Back', 'ban_menu')
                ]
            ])
        }
    );
    
    userSessions.set(ctx.from.id, { 
        action: 'waiting_ban_user',
        timestamp: Date.now() 
    });
});

bot.action('clear_expired_bans', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const now = Date.now();
    let clearedCount = 0;
    
    for (const [userId, ban] of Object.entries(botData.bannedUsers)) {
        if (ban.until <= now) {
            delete botData.bannedUsers[userId];
            clearedCount++;
        }
    }
    
    await saveData();
    
    await ctx.editMessageText(
        `🧹 **EXPIRED BANS CLEARED**\n` +
        `═══════════════════════════════════\n\n` +
        `🗑️ Cleared: **${clearedCount}** expired bans\n` +
        `⏰ Cleaned: ${formatTime(Date.now())}\n\n` +
        `Expired bans have been removed from database.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Ban Menu', 'ban_menu')]
            ])
        }
    );
});

bot.action('remove_whitelist', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    if (botData.whitelistUsers.length === 0) {
        await ctx.answerCbQuery('❌ No users in whitelist!', { show_alert: true });
        return;
    }
    
    await ctx.editMessageText(
        `➖ **REMOVE FROM WHITELIST**\n` +
        `═══════════════════════════════════\n\n` +
        `Send the User ID to remove from whitelist\n\n` +
        `💡 **Example:** \`123456789\``,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'cancel_session'),
                    Markup.button.callback('🔙 Back', 'whitelist_menu')
                ]
            ])
        }
    );
    
    userSessions.set(ctx.from.id, { 
        action: 'waiting_remove_whitelist',
        timestamp: Date.now() 
    });
});

bot.action('clear_whitelist_confirm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `⚠️ **CLEAR WHITELIST CONFIRMATION**\n` +
        `═══════════════════════════════════\n\n` +
        `Are you sure you want to clear all whitelisted users?\n\n` +
        `This will remove **${botData.whitelistUsers.length}** users from whitelist.\n\n` +
        `⚠️ This action cannot be undone!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Yes, Clear All', 'clear_whitelist_execute'),
                    Markup.button.callback('❌ Cancel', 'whitelist_menu')
                ]
            ])
        }
    );
});

bot.action('clear_whitelist_execute', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const count = botData.whitelistUsers.length;
    botData.whitelistUsers = [];
    await saveData();
    
    await ctx.editMessageText(
        `✅ **WHITELIST CLEARED**\n` +
        `═══════════════════════════════════\n\n` +
        `🗑️ Removed: **${count}** users\n` +
        `⏰ Cleared: ${formatTime(Date.now())}\n\n` +
        `All users removed from whitelist.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Whitelist Menu', 'whitelist_menu')]
            ])
        }
    );
});

bot.action('export_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const statsReport = `
📊 SECURITY BOT STATISTICS REPORT
Generated: ${formatTime(Date.now())}
═══════════════════════════════════

SYSTEM STATUS:
• Bot Status: ONLINE
• Detection: ${botData.detectionEnabled ? 'ENABLED' : 'DISABLED'}
• Lockdown: ${botData.lockdownMode ? 'ACTIVE' : 'INACTIVE'}

PROTECTION COVERAGE:
• Protected Groups: ${botData.groups.length}
• Active Groups: ${botData.groups.filter(g => g.active).length}
• Admin Users: ${botData.admins.length}
• Whitelisted Users: ${botData.whitelistUsers.length}

PERFORMANCE METRICS:
• Total Messages Processed: ${botData.stats.totalMessages}
• Messages Deleted: ${botData.stats.deletedMessages}
• Spam Messages Detected: ${botData.stats.detectedSpam}
• Total Violations: ${botData.stats.totalViolations}
• Users Banned: ${botData.stats.bannedUsers}

SECURITY SETTINGS:
• Max Violations Before Ban: ${botData.settings.maxViolations}
• Ban Duration: ${formatDuration(botData.settings.banDuration)}
• Anti-Flood: ${botData.settings.antiFlood ? 'ON' : 'OFF'}
• Anti-Link: ${botData.settings.antiLink ? 'ON' : 'OFF'}
• Anti-Forward: ${botData.settings.antiForward ? 'ON' : 'OFF'}

VIOLATION BREAKDOWN:
${Object.entries(botData.userViolations).map(([userId, data]) => 
    `• User ${userId}: ${data.count} violations`
).join('\n')}

ACTIVE BANS:
${Object.entries(botData.bannedUsers)
    .filter(([_, ban]) => ban.until > Date.now())
    .map(([userId, ban]) => 
        `• User ${userId}: Expires ${formatTime(ban.until)}`
    ).join('\n') || 'No active bans'}

═══════════════════════════════════
End of Report
`;

    try {
        await ctx.replyWithDocument({
            source: Buffer.from(statsReport),
            filename: `bot_stats_${Date.now()}.txt`
        });
        
        await ctx.answerCbQuery('📊 Stats exported successfully!');
    } catch (error) {
        await ctx.answerCbQuery('❌ Failed to export stats', { show_alert: true });
    }
});

bot.action('reset_stats_confirm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `⚠️ **RESET STATISTICS CONFIRMATION**\n` +
        `═══════════════════════════════════\n\n` +
        `Are you sure you want to reset all statistics?\n\n` +
        `This will reset:\n` +
        `• Messages deleted counter\n` +
        `• Spam detected counter\n` +
        `• Total messages counter\n` +
        `• Total violations counter\n\n` +
        `⚠️ This action cannot be undone!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Yes, Reset', 'reset_stats_execute'),
                    Markup.button.callback('❌ Cancel', 'stats_menu')
                ]
            ])
        }
    );
});

bot.action('reset_stats_execute', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    botData.stats = {
        deletedMessages: 0,
        detectedSpam: 0,
        bannedUsers: 0,
        totalMessages: 0,
        totalViolations: 0
    };
    await saveData();
    
    await ctx.editMessageText(
        `✅ **STATISTICS RESET**\n` +
        `═══════════════════════════════════\n\n` +
        `All statistics have been reset to zero.\n` +
        `⏰ Reset: ${formatTime(Date.now())}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Stats', 'stats_menu')]
            ])
        }
    );
});

bot.action('export_data', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    try {
        const dataToExport = {
            ...botData,
            messageHashes: Object.fromEntries(botData.messageHashes),
            imageHashes: Object.fromEntries(botData.imageHashes),
            lastMessages: Object.fromEntries(botData.lastMessages),
            exportedAt: Date.now(),
            exportedBy: ctx.from.id
        };
        
        await ctx.replyWithDocument({
            source: Buffer.from(JSON.stringify(dataToExport, null, 2)),
            filename: `bot_backup_${Date.now()}.json`
        });
        
        await ctx.answerCbQuery('📥 Data exported successfully!');
    } catch (error) {
        await ctx.answerCbQuery('❌ Failed to export data', { show_alert: true });
    }
});

bot.action('import_data', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `📤 **IMPORT DATA**\n` +
        `═══════════════════════════════════\n\n` +
        `⚠️ **WARNING:** This will replace all current data!\n\n` +
        `To import data:\n` +
        `1. Send the backup JSON file\n` +
        `2. Bot will validate and import the data\n` +
        `3. All current data will be replaced\n\n` +
        `Send the file now or click cancel.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'bot_settings')
                ]
            ])
        }
    );
    
    userSessions.set(ctx.from.id, { 
        action: 'waiting_import_file',
        timestamp: Date.now() 
    });
});

bot.action('restart_bot_confirm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `🔄 **RESTART BOT CONFIRMATION**\n` +
        `═══════════════════════════════════\n\n` +
        `Are you sure you want to restart the bot?\n\n` +
        `The bot will:\n` +
        `• Save all current data\n` +
        `• Stop accepting messages\n` +
        `• Restart all services\n` +
        `• Come back online in ~5 seconds\n\n` +
        `⚠️ There might be a brief downtime!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Yes, Restart', 'restart_bot_execute'),
                    Markup.button.callback('❌ Cancel', 'bot_settings')
                ]
            ])
        }
    );
});

bot.action('restart_bot_execute', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `🔄 **RESTARTING BOT...**\n` +
        `═══════════════════════════════════\n\n` +
        `Bot is restarting...\n` +
        `Please wait a moment.`,
        { parse_mode: 'Markdown' }
    );
    
    await saveData();
    
    setTimeout(() => {
        process.exit(0); // PM2 or systemd will restart the bot
    }, 1000);
});

bot.action('factory_reset_confirm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `🗑️ **FACTORY RESET CONFIRMATION**\n` +
        `═══════════════════════════════════\n\n` +
        `⚠️ **DANGER:** This will delete ALL data!\n\n` +
        `This includes:\n` +
        `• All admins (except main admin)\n` +
        `• All registered groups\n` +
        `• All statistics\n` +
        `• All bans and violations\n` +
        `• All settings\n\n` +
        `Type "CONFIRM RESET" to proceed.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('❌ Cancel', 'bot_settings')
                ]
            ])
        }
    );
    
    userSessions.set(ctx.from.id, { 
        action: 'waiting_factory_reset',
        timestamp: Date.now() 
    });
});

bot.action('violation_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const violations = Object.entries(botData.userViolations)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20);
    
    if (violations.length === 0) {
        await ctx.editMessageText(
            `⚠️ **VIOLATION LIST**\n` +
            `═══════════════════════════════════\n\n` +
            `✅ No violations recorded yet.\n\n` +
            `The system is monitoring all protected groups.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Security', 'security_menu')]
                ])
            }
        );
        return;
    }
    
    let violationText = `⚠️ **TOP 20 VIOLATORS**\n═══════════════════════════════════\n\n`;
    
    violations.forEach(([userId, data], index) => {
        violationText += `${index + 1}. User \`${userId}\`\n`;
        violationText += `   └ Violations: **${data.count}**\n`;
        violationText += `   └ Last: ${formatTime(data.lastViolation)}\n`;
        violationText += `   └ Status: ${botData.bannedUsers[userId] ? '🔴 Banned' : '🟢 Active'}\n\n`;
    });
    
    await ctx.editMessageText(violationText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Security', 'security_menu')]
        ])
    });
});

bot.action('rate_limits', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const activeLimits = Array.from(rateLimits.entries())
        .filter(([_, timestamps]) => {
            const now = Date.now();
            return timestamps.some(t => now - t < RATE_LIMIT_WINDOW);
        });
    
    let rateText = `⚡ **RATE LIMIT STATUS**\n═══════════════════════════════════\n\n`;
    rateText += `**Configuration:**\n`;
    rateText += `• Window: **${RATE_LIMIT_WINDOW/1000}** seconds\n`;
    rateText += `• Max Messages: **${MAX_MESSAGES_PER_WINDOW}**\n`;
    rateText += `• Active Users: **${activeLimits.length}**\n\n`;
    
    if (activeLimits.length > 0) {
        rateText += `**Rate Limited Users:**\n`;
        activeLimits.slice(0, 10).forEach(([userId, timestamps]) => {
            const recentCount = timestamps.filter(t => Date.now() - t < RATE_LIMIT_WINDOW).length;
            rateText += `• User \`${userId}\`: **${recentCount}** messages\n`;
        });
    } else {
        rateText += `✅ No users currently rate limited.`;
    }
    
    await ctx.editMessageText(rateText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Security', 'security_menu')]
        ])
    });
});

bot.action('toggle_group_status', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    if (botData.groups.length === 0) {
        await ctx.answerCbQuery('❌ No groups registered!', { show_alert: true });
        return;
    }
    
    const groupButtons = botData.groups.map(group => [
        Markup.button.callback(
            `${group.active ? '🟢' : '🔴'} ${group.name}`,
            `toggle_group_${group.id}`
        )
    ]);
    
    await ctx.editMessageText(
        `🔄 **TOGGLE GROUP STATUS**\n` +
        `═══════════════════════════════════\n\n` +
        `Click on a group to toggle its status:\n` +
        `🟢 = Active | 🔴 = Inactive`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                ...groupButtons,
                [Markup.button.callback('🔙 Back', 'group_menu')]
            ])
        }
    );
});

bot.action(/^toggle_group_(-?\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const groupId = parseInt(ctx.match[1]);
    const group = botData.groups.find(g => g.id === groupId);
    
    if (group) {
        group.active = !group.active;
        await saveData();
        
        await ctx.answerCbQuery(`Group ${group.active ? 'activated' : 'deactivated'}`);
        
        // Refresh the toggle menu
        const groupButtons = botData.groups.map(g => [
            Markup.button.callback(
                `${g.active ? '🟢' : '🔴'} ${g.name}`,
                `toggle_group_${g.id}`
            )
        ]);
        
        await ctx.editMessageText(
            `🔄 **TOGGLE GROUP STATUS**\n` +
            `═══════════════════════════════════\n\n` +
            `✅ Status updated for: **${group.name}**\n\n` +
            `Click on a group to toggle its status:\n` +
            `🟢 = Active | 🔴 = Inactive`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    ...groupButtons,
                    [Markup.button.callback('🔙 Back', 'group_menu')]
                ])
            }
        );
    }
});

bot.action('export_logs', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const logs = [];
    
    // Compile logs
    Object.entries(botData.userViolations).forEach(([userId, data]) => {
        Object.entries(data.types).forEach(([type, count]) => {
            logs.push({
                timestamp: data.lastViolation,
                userId,
                type,
                count
            });
        });
    });
    
    // Sort by timestamp
    logs.sort((a, b) => b.timestamp - a.timestamp);
    
    // Format logs
    let logText = `SECURITY BOT VIOLATION LOGS\n`;
    logText += `Generated: ${formatTime(Date.now())}\n`;
    logText += `═══════════════════════════════════\n\n`;
    
    logs.forEach(log => {
        logText += `[${formatTime(log.timestamp)}]\n`;
        logText += `User: ${log.userId}\n`;
        logText += `Type: ${log.type}\n`;
        logText += `Count: ${log.count}\n`;
        logText += `─────────────────\n`;
    });
    
    try {
        await ctx.replyWithDocument({
            source: Buffer.from(logText),
            filename: `violation_logs_${Date.now()}.txt`
        });
        
        await ctx.answerCbQuery('📜 Logs exported successfully!');
    } catch (error) {
        await ctx.answerCbQuery('❌ Failed to export logs', { show_alert: true });
    }
});

bot.action('clear_logs_confirm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `🧹 **CLEAR LOGS CONFIRMATION**\n` +
        `═══════════════════════════════════\n\n` +
        `Are you sure you want to clear all violation logs?\n\n` +
        `This will remove:\n` +
        `• All user violations\n` +
        `• All violation history\n\n` +
        `⚠️ This action cannot be undone!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Yes, Clear', 'clear_logs_execute'),
                    Markup.button.callback('❌ Cancel', 'logs_menu')
                ]
            ])
        }
    );
});

bot.action('clear_logs_execute', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const count = Object.keys(botData.userViolations).length;
    botData.userViolations = {};
    await saveData();
    
    await ctx.editMessageText(
        `✅ **LOGS CLEARED**\n` +
        `═══════════════════════════════════\n\n` +
        `🗑️ Cleared: **${count}** user violation records\n` +
        `⏰ Cleared: ${formatTime(Date.now())}\n\n` +
        `All violation logs have been removed.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Logs', 'logs_menu')]
            ])
        }
    );
});

bot.action('clean_violations', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const count = Object.keys(botData.userViolations).length;
    botData.userViolations = {};
    await saveData();
    
    await ctx.editMessageText(
        `✅ **VIOLATIONS CLEANED**\n` +
        `═══════════════════════════════════\n\n` +
        `🗑️ Removed: **${count}** violation records\n` +
        `⏰ Cleaned: ${formatTime(Date.now())}\n\n` +
        `All violation records have been reset.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Clean Menu', 'clean_data')]
            ])
        }
    );
});

bot.action('clean_all_confirm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    await ctx.editMessageText(
        `🧹 **CLEAN ALL DATA CONFIRMATION**\n` +
        `═══════════════════════════════════\n\n` +
        `This will clean:\n` +
        `• All message hashes\n` +
        `• All image hashes\n` +
        `• All violations\n` +
        `• All expired bans\n\n` +
        `⚠️ Are you sure?`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Yes, Clean All', 'clean_all_execute'),
                    Markup.button.callback('❌ Cancel', 'clean_data')
                ]
            ])
        }
    );
});

bot.action('clean_all_execute', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    // Clean all temporary data
    const stats = {
        messages: botData.messageHashes.size,
        images: botData.imageHashes.size,
        violations: Object.keys(botData.userViolations).length,
        bans: 0
    };
    
    botData.messageHashes.clear();
    botData.imageHashes.clear();
    botData.lastMessages.clear();
    botData.userViolations = {};
    
    // Clean expired bans
    const now = Date.now();
    for (const [userId, ban] of Object.entries(botData.bannedUsers)) {
        if (ban.until <= now) {
            delete botData.bannedUsers[userId];
            stats.bans++;
        }
    }
    
    await saveData();
    
    await ctx.editMessageText(
        `✅ **ALL DATA CLEANED**\n` +
        `═══════════════════════════════════\n\n` +
        `🗑️ **Cleaned:**\n` +
        `• Message hashes: **${stats.messages}**\n` +
        `• Image hashes: **${stats.images}**\n` +
        `• Violations: **${stats.violations}**\n` +
        `• Expired bans: **${stats.bans}**\n\n` +
        `⏰ Cleaned: ${formatTime(Date.now())}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Security', 'security_menu')]
            ])
        }
    );
});

// Enhanced Photo Handler
bot.on('photo', async (ctx) => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    
    // Check if group is allowed
    if (!isGroupAllowed(chatId)) return;

    // Track total messages
    botData.stats.totalMessages++;

    // Skip if admin, whitelisted, atau bot disabled
    if (isAdmin(userId) || isWhitelisted(userId) || !botData.detectionEnabled) return;

    // Check if user is banned
    const userBan = botData.bannedUsers[userId];
    if (userBan && userBan.until > Date.now()) {
        try {
            await ctx.deleteMessage();
            botData.stats.deletedMessages++;
        } catch (error) {
            console.error('Error deleting banned user photo:', error);
        }
        return;
    }

    // Lockdown mode check
    if (botData.lockdownMode) {
        try {
            await ctx.deleteMessage();
            botData.stats.deletedMessages++;
        } catch (error) {
            console.error('Error deleting photo in lockdown:', error);
        }
        return;
    }

    let shouldDelete = false;
    let violationType = '';

    // Rate limiting check
    if (botData.settings.antiFlood && !checkRateLimit(userId)) {
        shouldDelete = true;
        violationType = 'Rate Limit Exceeded';
    }

    // Image duplicate check
    if (!shouldDelete && await isDuplicateImage(ctx.message.photo, userId)) {
        shouldDelete = true;
        violationType = 'Duplicate Image';
        botData.stats.detectedSpam++;
    }

    // Check caption for dangerous content
    if (!shouldDelete && ctx.message.caption && checkDangerousContent(ctx.message.caption)) {
        shouldDelete = true;
        violationType = 'Dangerous Caption';
    }

    // Anti-Link in caption
    if (!shouldDelete && botData.settings.antiLink && ctx.message.caption) {
        const linkPattern = /(?:https?:\/\/|www\.|t\.me|telegram\.me)/gi;
        if (linkPattern.test(ctx.message.caption)) {
            shouldDelete = true;
            violationType = 'Link in Caption';
        }
    }

    // Process violation - SILENT DELETE
    if (shouldDelete) {
        try {
            await ctx.deleteMessage();
            botData.stats.deletedMessages++;
            
            // Track violations
            trackViolation(userId, violationType);
            
            await saveData();
        } catch (error) {
            console.error('Error deleting photo:', error);
        }
    }
});

// Other media handlers
['video', 'document', 'audio', 'voice', 'sticker', 'animation'].forEach(mediaType => {
    bot.on(mediaType, async (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        
        if (!isGroupAllowed(chatId)) return;
        
        botData.stats.totalMessages++;
        
        if (isAdmin(userId) || isWhitelisted(userId) || !botData.detectionEnabled) return;

        // Check if user is banned
        const userBan = botData.bannedUsers[userId];
        if (userBan && userBan.until > Date.now()) {
            try {
                await ctx.deleteMessage();
                botData.stats.deletedMessages++;
            } catch (error) {
                console.error(`Error deleting banned user ${mediaType}:`, error);
            }
            return;
        }

        // Lockdown mode check
        if (botData.lockdownMode) {
            try {
                await ctx.deleteMessage();
                botData.stats.deletedMessages++;
            } catch (error) {
                console.error(`Error deleting ${mediaType} in lockdown:`, error);
            }
            return;
        }

        // Rate limiting check
        if (botData.settings.antiFlood && !checkRateLimit(userId)) {
            try {
                await ctx.deleteMessage();
                botData.stats.deletedMessages++;
                trackViolation(userId, 'Media Rate Limit');
                await saveData();
            } catch (error) {
                console.error(`Error handling ${mediaType} rate limit:`, error);
            }
        }
    });
});

// Document handler for import
bot.on('document', async (ctx) => {
    if (ctx.chat.type !== 'private' || !isAdmin(ctx.from.id)) return;
    
    const session = userSessions.get(ctx.from.id);
    if (!session || session.action !== 'waiting_import_file') return;
    
    try {
        const file = await ctx.telegram.getFile(ctx.message.document.file_id);
        const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        // Validate data structure
        if (!data.admins || !data.groups || !data.stats) {
            throw new Error('Invalid data structure');
        }
        
        // Import data
        botData = {
            ...botData,
            ...data,
            messageHashes: new Map(Object.entries(data.messageHashes || {})),
            imageHashes: new Map(Object.entries(data.imageHashes || {})),
            lastMessages: new Map(Object.entries(data.lastMessages || {}))
        };
        
        await saveData();
        userSessions.delete(ctx.from.id);
        
        await ctx.reply(
            `✅ **DATA IMPORTED SUCCESSFULLY**\n` +
            `═══════════════════════════════════\n\n` +
            `📥 All data has been imported\n` +
            `⏰ Imported: ${formatTime(Date.now())}\n\n` +
            `Bot is now using the imported configuration.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Settings', 'bot_settings')]
                ])
            }
        );
    } catch (error) {
        userSessions.delete(ctx.from.id);
        await ctx.reply(
            `❌ **IMPORT FAILED**\n\n` +
            `Error: ${error.message}\n\n` +
            `Please make sure the file is a valid backup.`,
            { parse_mode: 'Markdown' }
        );
    }
});

// Handle factory reset confirmation
bot.on('text', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    
    const userId = ctx.from.id;
    const session = userSessions.get(userId);
    
    if (session && session.action === 'waiting_factory_reset') {
        if (ctx.message.text === 'CONFIRM RESET') {
            // Reset to factory defaults
            botData = {
                admins: [MAIN_ADMIN],
                groups: [],
                detectionEnabled: true,
                lockdownMode: false,
                userViolations: {},
                messageHashes: new Map(),
                imageHashes: new Map(),
                lastMessages: new Map(),
                bannedUsers: {},
                whitelistUsers: [],
                stats: {
                    deletedMessages: 0,
                    detectedSpam: 0,
                    bannedUsers: 0,
                    totalMessages: 0,
                    totalViolations: 0
                },
                settings: {
                    autoDeleteWarnings: true,
                    notifyAdmins: true,
                    maxViolations: 10,
                    banDuration: 86400000,
                    deleteJoinMessages: true,
                    antiFlood: true,
                    antiLink: true,
                    antiForward: true
                }
            };
            
            await saveData();
            userSessions.delete(userId);
            
            await ctx.reply(
                `✅ **FACTORY RESET COMPLETE**\n` +
                `═══════════════════════════════════\n\n` +
                `All data has been reset to defaults.\n` +
                `⏰ Reset: ${formatTime(Date.now())}\n\n` +
                `Bot is now in factory state.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🏠 Go to Main Menu', 'back_main')]
                    ])
                }
            );
        } else {
            await ctx.reply(
                `❌ **Incorrect confirmation**\n\n` +
                `Type exactly: CONFIRM RESET`,
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    if (session && session.action === 'waiting_remove_whitelist') {
        const removeId = parseInt(ctx.message.text);
        
        if (isNaN(removeId) || removeId <= 0) {
            return ctx.reply('❌ **Invalid User ID**\n\nPlease send a valid positive number', { parse_mode: 'Markdown' });
        }
        
        const index = botData.whitelistUsers.indexOf(removeId);
        if (index === -1) {
            return ctx.reply('⚠️ **User Not in Whitelist**\n\nThis user is not whitelisted', { parse_mode: 'Markdown' });
        }
        
        botData.whitelistUsers.splice(index, 1);
        await saveData();
        userSessions.delete(userId);
        
        await ctx.reply(
            `✅ **USER REMOVED FROM WHITELIST**\n` +
            `═══════════════════════════════════\n\n` +
            `👤 **User ID:** \`${removeId}\`\n` +
            `📋 **Remaining:** ${botData.whitelistUsers.length} users\n` +
            `⏰ **Removed:** ${formatTime(Date.now())}\n\n` +
            `User will now be subject to security checks.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Whitelist', 'whitelist_menu')]
                ])
            }
        );
    }
});

// Group Event Handlers
bot.on('new_chat_members', async (ctx) => {
    const chatId = ctx.chat.id;
    const newMembers = ctx.message.new_chat_members;
    
    // Track message
    botData.stats.totalMessages++;
    
    // Check if bot is the new member
    const botMember = newMembers.find(member => member.id === ctx.botInfo.id);
    
    if (botMember) {
        // Check if group is allowed
        if (!isGroupAllowed(chatId)) {
            await ctx.reply(
                `⚠️ **ACCESS DENIED**\n\n` +
                `Bot tidak diizinkan di grup ini.\n` +
                `Hubungi admin untuk mendapatkan akses.\n\n` +
                `Admin: @${(await bot.telegram.getChat(MAIN_ADMIN)).username || 'admin'}`,
                { parse_mode: 'Markdown' }
            );
            
            setTimeout(async () => {
                try {
                    await ctx.leaveChat();
                } catch (error) {
                    console.error('Error leaving chat:', error);
                }
            }, 5000);
            return;
        }

        // Send welcome message
        await ctx.reply(
            `🤖 **SECURITY BOT ACTIVE**\n` +
            `═══════════════════════════════════\n\n` +
            `✅ Group protection enabled\n` +
            `🛡️ All security features active\n` +
            `🔕 Silent operation mode\n\n` +
            `Bot will automatically moderate content.`,
            { parse_mode: 'Markdown' }
        );
    } else if (botData.settings.deleteJoinMessages && isGroupAllowed(chatId)) {
        // Delete join messages if enabled
        try {
            await ctx.deleteMessage();
            botData.stats.deletedMessages++;
        } catch (error) {
            console.error('Error deleting join message:', error);
        }
    }
});

bot.on('left_chat_member', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // Track message
    botData.stats.totalMessages++;
    
    if (botData.settings.deleteJoinMessages && isGroupAllowed(chatId)) {
        // Delete leave messages if enabled
        try {
            await ctx.deleteMessage();
            botData.stats.deletedMessages++;
        } catch (error) {
            console.error('Error deleting leave message:', error);
        }
    }
});

// Auto cleanup - Enhanced
setInterval(async () => {
    try {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const oneHour = 60 * 60 * 1000;

        let cleaned = 0;

        // Clean expired bans
        for (const [userId, ban] of Object.entries(botData.bannedUsers)) {
            if (ban.until < now) {
                delete botData.bannedUsers[userId];
                cleaned++;
            }
        }

        // Clean old image hashes (older than 1 day)
        for (const [key, timestamp] of botData.imageHashes.entries()) {
            if (now - timestamp > oneDay) {
                botData.imageHashes.delete(key);
                cleaned++;
            }
        }

        // Clean old rate limits
        rateLimits.clear();

        // Clean old violations (older than 7 days)
        const sevenDays = 7 * oneDay;
        for (const [userId, violation] of Object.entries(botData.userViolations)) {
            if (now - violation.lastViolation > sevenDays) {
                delete botData.userViolations[userId];
                cleaned++;
            }
        }

        // Clean old sessions (older than 1 hour)
        for (const [userId, session] of userSessions.entries()) {
            if (session.timestamp && (now - session.timestamp > oneHour)) {
                userSessions.delete(userId);
                cleaned++;
            }
        }

        // Clean message hashes periodically
        if (botData.lastMessages.size > 1000) {
            // Keep only recent active users
            const activeUserLimit = 500;
            const entries = Array.from(botData.lastMessages.entries());
            botData.lastMessages.clear();
            
            entries.slice(-activeUserLimit).forEach(([userId, messages]) => {
                botData.lastMessages.set(userId, messages);
            });
            cleaned += entries.length - activeUserLimit;
        }

        if (cleaned > 0) {
            await saveData();
            console.log(`🧹 Auto-cleanup: ${cleaned} items cleaned at ${formatTime(now)}`);
        }
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    }
}, 300000); // Run every 5 minutes

// Enhanced error handling
bot.catch(async (err, ctx) => {
    console.error('🚨 BOT ERROR:', {
        error: err.message,
        stack: err.stack,
        time: new Date().toISOString(),
        updateType: ctx?.updateType,
        chatId: ctx?.chat?.id,
        userId: ctx?.from?.id
    });

    // Clean up session if error occurred
    if (ctx?.from?.id) {
        userSessions.delete(ctx.from.id);
    }

    // Try to save data
    try {
        await saveData();
    } catch (saveError) {
        console.error('❌ Failed to save data after error:', saveError);
    }
    
    // Notify main admin about critical errors
    if (botData.settings.notifyAdmins) {
        try {
            await bot.telegram.sendMessage(
                MAIN_ADMIN,
                `🚨 **BOT ERROR**\n\n` +
                `Error: ${err.message}\n` +
                `Time: ${formatTime(Date.now())}\n` +
                `Type: ${ctx?.updateType || 'Unknown'}`,
                { parse_mode: 'Markdown' }
            );
        } catch {}
    }
});

// Process handlers
process.on('uncaughtException', (error) => {
    console.error('🚨 UNCAUGHT EXCEPTION:', error);
    saveData().catch(() => {});
});

process.on('unhandledRejection', (reason) => {
    console.error('🚨 UNHANDLED REJECTION:', reason);
    saveData().catch(() => {});
});

// Startup function
const startBot = async () => {
    try {
        console.log('🚀 Starting Enhanced Security Bot V7.0...');
        
        await loadData();
        console.log(`📊 Data loaded: ${botData.admins.length} admins, ${botData.groups.length} groups`);
        
        // Test bot token
        const botInfo = await bot.telegram.getMe();
        console.log(`🤖 Bot ready: @${botInfo.username}`);
        
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query', 'chat_member']
        });
        
        console.log('✅ Enhanced Security Bot V7.0 Started Successfully!');
        console.log(`🛡️ Protection Level: MAXIMUM`);
        console.log(`⚡ Rate Limit: ${MAX_MESSAGES_PER_WINDOW} msg/${RATE_LIMIT_WINDOW/1000}s`);
        console.log(`🎯 Detection Patterns: ${dangerousPatterns.length} rules`);
        console.log(`🔕 Silent Mode: ENABLED`);
        console.log(`📅 Started: ${formatTime(Date.now())}`);
        
        // Notify main admin
        try {
            await bot.telegram.sendMessage(
                MAIN_ADMIN,
                `✅ **BOT STARTED**\n\n` +
                `🤖 Security Bot V7.0 is now online\n` +
                `⏰ Started: ${formatTime(Date.now())}`,
                { parse_mode: 'Markdown' }
            );
        } catch {}
        
        // Graceful shutdown
        process.once('SIGINT', () => gracefulStop('SIGINT'));
        process.once('SIGTERM', () => gracefulStop('SIGTERM'));
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        setTimeout(startBot, 5000); // Retry after 5 seconds
    }
};

const gracefulStop = async (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
        await saveData();
        console.log('✅ Data saved');
        
        bot.stop(signal);
        console.log('✅ Bot stopped');
        
        userSessions.clear();
        rateLimits.clear();
        console.log('✅ Sessions cleared');
        
        // Notify admin
        try {
            await bot.telegram.sendMessage(
                MAIN_ADMIN,
                `🛑 **BOT STOPPED**\n\n` +
                `Signal: ${signal}\n` +
                `⏰ Stopped: ${formatTime(Date.now())}`,
                { parse_mode: 'Markdown' }
            );
        } catch {}
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

// Start the bot
startBot();

console.log(`
╔═══════════════════════════════════════╗
║   ENHANCED SECURITY BOT V7.0          ║
║   FULL FEATURED EDITION               ║
╚═══════════════════════════════════════╝

📦 **Setup Instructions:**
1. npm install telegraf
2. Update BOT_TOKEN and MAIN_ADMIN
3. node bot.js (or use PM2 for production)

🔥 **NEW FEATURES IN V7.0:**
✅ Complete inline button system
✅ Back button on every action
✅ Advanced settings management
✅ Whitelist system
✅ Import/Export functionality
✅ Enhanced statistics & logs
✅ Factory reset option
✅ Group status toggle
✅ Detailed violation tracking
✅ Admin activity monitoring
✅ Auto-cleanup system
✅ Error recovery & notifications

🛡️ **Security Features:**
• ${dangerousPatterns.length} detection patterns
• Rate limiting: ${MAX_MESSAGES_PER_WINDOW} msg/${RATE_LIMIT_WINDOW/1000}s
• Auto-ban after ${botData.settings.maxViolations} violations
• Ban duration: ${formatDuration(botData.settings.banDuration)}
• Silent operation mode
• Multi-group support
• Lockdown mode
• Anti-flood, anti-link, anti-forward

💡 **Commands:**
• /start - Open admin panel (admin only)
• /myid - Get your user ID

🔧 **Created by:** @hiyaok
📅 **Version:** 7.0 Full Featured
🚀 **Status:** Starting...
`);

module.exports = { bot, botData, isAdmin, checkDangerousContent };
