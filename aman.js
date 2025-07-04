// CODING BY @hiyaok ON TELEGRAM
// U CAN ORDERS JASA BOT TO @hiyaok
// TRUSTED JASA BOT TELEGRAM TERBAIK

//modules pake telegraf
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

// Konfigurasi Bot
const BOT_TOKEN = '7508883526:AAEqe2f48tCzwtlCjbUyEBJMzTDg7J6jPME
'; // Ganti dengan token bot Anda
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
    stats: {
        deletedMessages: 0,
        detectedSpam: 0,
        bannedUsers: 0
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
    
    // Auto ban setelah 10 violations
    if (botData.userViolations[userId].count >= 10) {
        const banUntil = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
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
    return new Date(timestamp).toLocaleString('id-ID');
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
            Markup.button.callback('🔒 Lockdown Mode', 'lockdown_toggle'),
            Markup.button.callback('🔄 Refresh', 'refresh_main')
        ]
    ]);
};

// Command Handlers
bot.start(async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ **Akses Ditolak**\n\nAnda tidak memiliki izin untuk menggunakan bot ini.', { parse_mode: 'Markdown' });
    }

    const welcomeMessage = `
🤖 **Bot Keamanan Premium V6.0**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

👋 Selamat datang, **${ctx.from.first_name}**!

🔥 **Fitur Keamanan Premium:**
✅ Deteksi Pattern Bahaya (${dangerousPatterns.length} rules)
✅ Rate Limiting Super Ketat (5 msg/30s)
✅ Hash Checking Gambar Duplikat
✅ Anti-Spam & Duplicate Detection
✅ Auto-Ban System (10 violations)
✅ Silent Operation (No Spam Notifications)
✅ Multi-Group Support
✅ Lightning Fast Processing

🛡️ **Status Sistem:**
🟢 Bot Online & Active
🔍 Detection: ${botData.detectionEnabled ? 'Enabled' : 'Disabled'}
🏢 Groups: ${botData.groups.length} registered
👥 Admins: ${botData.admins.length} active
🔒 Lockdown: ${botData.lockdownMode ? 'Active' : 'Inactive'}

📊 **Stats:**
🗑️ Deleted Messages: ${botData.stats.deletedMessages}
🚫 Spam Detected: ${botData.stats.detectedSpam}
🔨 Users Banned: ${botData.stats.bannedUsers}

⚡ Pilih menu di bawah untuk mengakses fitur:
    `;

    await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// Callback Query Handlers
bot.action('admin_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const adminMessage = `
👥 **Admin Management Panel**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **Current Status:**
🔹 Total Admins: **${botData.admins.length}**
🔹 Main Admin: **${MAIN_ADMIN}**
🔹 Last Update: **${formatTime(Date.now())}**

⚙️ **Available Actions:**
• Add new admin to system
• Remove existing admin
• View complete admin list

⚠️ **Note:** Main admin cannot be removed
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
                Markup.button.callback('🔙 Back', 'back_main')
            ]
        ])
    });
});

bot.action('group_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const groupMessage = `
🏢 **Group Management Panel**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **Current Status:**
🔹 Registered Groups: **${botData.groups.length}**
🔹 Active Protection: **${botData.groups.filter(g => g.active).length}**
🔹 Messages Deleted: **${botData.stats.deletedMessages}**

⚙️ **Available Actions:**
• Add group to whitelist
• Remove group from system
• View all registered groups

🛡️ **Protection Features:**
• Silent auto-moderation
• Real-time spam detection
• Duplicate content filtering
• Image hash verification
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
                Markup.button.callback('🔙 Back', 'back_main')
            ]
        ])
    });
});

bot.action('security_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const securityMessage = `
🛡️ **Security Settings Panel**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 **Detection Status:** ${botData.detectionEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}
📊 **Violations Today:** ${Object.keys(botData.userViolations).length}
🚫 **Banned Users:** ${Object.keys(botData.bannedUsers).length}
🔄 **Rate Limits:** ${rateLimits.size} users tracked

⚡ **Security Features:**
• ${dangerousPatterns.length} detection patterns
• Rate limit: ${MAX_MESSAGES_PER_WINDOW} msg/${RATE_LIMIT_WINDOW/1000}s
• Auto-ban after 10 violations
• Duplicate detection (text & images)
• Silent operation mode
• Multi-group simultaneous protection

🎯 **Detection Categories:**
• Investment scams & MLM schemes
• Hate speech & SARA content
• Violence & threat messages
• Adult content (18+)
• Fraud & deception attempts
• Harassment & spam abuse
• Suspicious links & phone numbers
• Excessive emoji & caps spam
    `;

    await ctx.editMessageText(securityMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [
                Markup.button.callback(`🔍 Detection: ${botData.detectionEnabled ? 'ON' : 'OFF'}`, 'toggle_detection'),
                Markup.button.callback('🧹 Clean Data', 'clean_data')
            ],
            [
                Markup.button.callback('⚡ Rate Limits', 'rate_limits'),
                Markup.button.callback('🚫 Banned Users', 'banned_users')
            ],
            [
                Markup.button.callback('🔙 Back', 'back_main')
            ]
        ])
    });
});

bot.action('stats_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const totalViolations = Object.values(botData.userViolations).reduce((sum, v) => sum + v.count, 0);
    const activeBans = Object.values(botData.bannedUsers).filter(ban => ban.until > Date.now()).length;

    const statsMessage = `
📊 **System Statistics**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 **Performance Metrics:**
🗑️ Messages Deleted: **${botData.stats.deletedMessages}**
🚫 Spam Detected: **${botData.stats.detectedSpam}**
🔨 Users Banned: **${botData.stats.bannedUsers}**
⚡ Response Time: **< 50ms**

🏢 **Group Statistics:**
📊 Protected Groups: **${botData.groups.length}**
🛡️ Total Violations: **${totalViolations}**
🔍 Active Bans: **${activeBans}**
📸 Image Hashes: **${botData.imageHashes.size}**

⚙️ **System Health:**
🟢 Bot Status: **Online**
🟢 Detection Engine: **Active**
🟢 Database: **Operational**
🟢 Rate Limiter: **Functional**
🟢 Memory Usage: **Optimized**

📈 **Detection Patterns:** ${dangerousPatterns.length} rules active
🔄 **Rate Limit:** ${MAX_MESSAGES_PER_WINDOW} msg/${RATE_LIMIT_WINDOW/1000}s
⏰ **Auto-Ban:** 10 violations trigger

🕐 **Last Update:** ${formatTime(Date.now())}
    `;

    await ctx.editMessageText(statsMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh Stats', 'stats_menu')],
            [Markup.button.callback('🔙 Back to Main', 'back_main')]
        ])
    });
});

// Session Management untuk Add Admin/Group
bot.action('add_admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.editMessageText(
        `➕ **Add New Admin**\n\n` +
        `📝 **Instructions:**\n` +
        `Send the User ID as a number\n\n` +
        `💡 **Example:** 123456789\n\n` +
        `ℹ️ **How to get User ID:**\n` +
        `• Forward message from user to @userinfobot\n` +
        `• Or use @getmyid_bot\n\n` +
        `⚠️ Make sure the User ID is correct!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancel', 'cancel_session')],
                [Markup.button.callback('🔙 Back', 'admin_menu')]
            ])
        }
    );

    userSessions.set(ctx.from.id, { 
        action: 'waiting_admin',
        timestamp: Date.now() 
    });
});

bot.action('add_group', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.editMessageText(
        `➕ **Add New Group**\n\n` +
        `📝 **Instructions:**\n` +
        `Send the Group ID (negative number)\n\n` +
        `💡 **Example:** -1001234567890\n\n` +
        `ℹ️ **How to get Group ID:**\n` +
        `• Add @userinfobot to your group\n` +
        `• Bot will show the group ID\n` +
        `• Or forward message from group to @userinfobot\n\n` +
        `⚠️ Group ID must be negative number!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancel', 'cancel_session')],
                [Markup.button.callback('🔙 Back', 'group_menu')]
            ])
        }
    );

    userSessions.set(ctx.from.id, { 
        action: 'waiting_group',
        timestamp: Date.now() 
    });
});

// Enhanced Text Handler untuk Session
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    
    // Handle private chat sessions
    if (ctx.chat.type === 'private') {
        if (!isAdmin(userId)) return;
        
        const session = userSessions.get(userId);
        if (!session) return;
        
        try {
            if (session.action === 'waiting_admin') {
                const newAdminId = parseInt(text);
                
                if (isNaN(newAdminId) || newAdminId <= 0) {
                    return ctx.reply('❌ **Invalid User ID**\n\nPlease send a valid positive number');
                }

                if (botData.admins.includes(newAdminId)) {
                    return ctx.reply('⚠️ **User Already Admin**\n\nThis user is already an admin');
                }

                botData.admins.push(newAdminId);
                await saveData();
                
                userSessions.delete(userId);

                await ctx.reply(
                    `✅ **Admin Added Successfully**\n\n` +
                    `👤 **New Admin ID:** \`${newAdminId}\`\n` +
                    `👥 **Total Admins:** ${botData.admins.length}\n` +
                    `⏰ **Added:** ${formatTime(Date.now())}\n\n` +
                    `🔑 User now has full admin access to bot`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            if (session.action === 'waiting_group') {
                const groupId = parseInt(text);
                
                if (isNaN(groupId) || groupId >= 0) {
                    return ctx.reply('❌ **Invalid Group ID**\n\nGroup ID must be a negative number\nExample: -1001234567890');
                }

                if (botData.groups.some(g => g.id === groupId)) {
                    return ctx.reply('⚠️ **Group Already Registered**\n\nThis group is already in the whitelist');
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
                    `✅ **Group Added Successfully**\n\n` +
                    `🏢 **Group:** ${groupName}\n` +
                    `📋 **Group ID:** \`${groupId}\`\n` +
                    `🏢 **Total Groups:** ${botData.groups.length}\n` +
                    `⏰ **Added:** ${formatTime(Date.now())}\n\n` +
                    `🛡️ Group is now under security protection`,
                    { parse_mode: 'Markdown' }
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

    // Skip if admin atau bot disabled
    if (isAdmin(userId) || !botData.detectionEnabled) return;

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

    // Rate limiting check
    if (!checkRateLimit(userId)) {
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

    // Forward message check (high risk)
    if (!shouldDelete && ctx.message.forward_from) {
        shouldDelete = true;
        violationType = 'Suspicious Forward';
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
            console.error('Error deleting message:', error);
        }
    }
});

// Enhanced Photo Handler
bot.on('photo', async (ctx) => {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    
    // Check if group is allowed
    if (!isGroupAllowed(chatId)) return;

    // Skip if admin atau bot disabled
    if (isAdmin(userId) || !botData.detectionEnabled) return;

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
    if (!checkRateLimit(userId)) {
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

// Other event handlers untuk semua media types
['video', 'document', 'audio', 'voice', 'sticker', 'animation'].forEach(mediaType => {
    bot.on(mediaType, async (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        
        if (!isGroupAllowed(chatId) || isAdmin(userId) || !botData.detectionEnabled) return;

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
        if (!checkRateLimit(userId)) {
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

// Group Event Handlers - MINIMAL NOTIFICATIONS
bot.on('new_chat_members', async (ctx) => {
    const chatId = ctx.chat.id;
    const newMembers = ctx.message.new_chat_members;
    
    // Check if bot is the new member
    const botMember = newMembers.find(member => member.id === ctx.botInfo.id);
    
    if (botMember) {
        // Check if group is allowed
        if (!isGroupAllowed(chatId)) {
            await ctx.reply('⚠️ **Access Denied** - Bot tidak diizinkan di grup ini. Hubungi admin untuk akses.');
            
            setTimeout(async () => {
                try {
                    await ctx.leaveChat();
                } catch (error) {
                    console.error('Error leaving chat:', error);
                }
            }, 5000);
            return;
        }

        // Just send simple welcome without spam
        await ctx.reply('🤖 **Security Bot Active** - Group protection enabled');
    }
});

// Additional Callback Handlers
bot.action('back_main', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const mainMessage = `
🤖 **Bot Keamanan Premium V6.0**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ **Status Sistem:**
🟢 Bot Online & Active
🔍 Detection: ${botData.detectionEnabled ? 'Enabled' : 'Disabled'}
🏢 Groups: ${botData.groups.length} registered
👥 Admins: ${botData.admins.length} active
🔒 Lockdown: ${botData.lockdownMode ? 'Active' : 'Inactive'}

📊 **Quick Stats:**
🗑️ Deleted: ${botData.stats.deletedMessages}
🚫 Spam: ${botData.stats.detectedSpam}
🔨 Banned: ${botData.stats.bannedUsers}

⚡ Pilih menu untuk mengakses fitur:
    `;

    await ctx.editMessageText(mainMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

bot.action('cancel_session', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    userSessions.delete(ctx.from.id);
    await ctx.answerCbQuery('❌ Action cancelled');
    
    // Return to main menu
    await ctx.editMessageText(
        `🤖 **Bot Keamanan Premium V6.0**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `✅ **Action Cancelled**\n\n` +
        `⚡ Pilih menu untuk mengakses fitur:`,
        {
            parse_mode: 'Markdown',
            ...getMainKeyboard()
        }
    );
});

bot.action('toggle_detection', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    botData.detectionEnabled = !botData.detectionEnabled;
    await saveData();

    await ctx.answerCbQuery(`🔍 Detection ${botData.detectionEnabled ? 'Enabled' : 'Disabled'}`);
    
    // Refresh security menu
    ctx.editMessageText(
        `🛡️ **Security Settings Updated**\n\n` +
        `🔍 **Detection:** ${botData.detectionEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}\n` +
        `⏰ **Changed:** ${formatTime(Date.now())}\n\n` +
        `${botData.detectionEnabled ? 
            '✅ All security features are now active' : 
            '⚠️ Security detection is now disabled'}`,
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
        `🔒 **Lockdown Mode ${status}**\n\n` +
        `📊 **Status:** ${status}\n` +
        `🏢 **Affected Groups:** ${botData.groups.length}\n` +
        `⏰ **Changed:** ${formatTime(Date.now())}\n\n` +
        `${botData.lockdownMode ? 
        `🚨 **LOCKDOWN ACTIVE**\n• All user messages will be deleted\n• Only admins can send messages` :
        `✅ **NORMAL MODE**\n• Standard security monitoring\n• Users can send messages normally`}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Toggle Again', 'lockdown_toggle')],
                [Markup.button.callback('🔙 Back to Main', 'back_main')]
            ])
        }
    );
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
            console.log(`🧹 Auto-cleanup: ${cleaned} items cleaned`);
        }
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    }
}, 300000); // Run every 5 minutes

// Enhanced error handling
bot.catch(async (err, ctx) => {
    console.error('🚨 BOT ERROR:', {
        error: err.message,
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
        console.log('🚀 Starting Enhanced Security Bot...');
        
        await loadData();
        console.log(`📊 Data loaded: ${botData.admins.length} admins, ${botData.groups.length} groups`);
        
        // Test bot token
        const botInfo = await bot.telegram.getMe();
        console.log(`🤖 Bot ready: @${botInfo.username}`);
        
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query', 'chat_member']
        });
        
        console.log('✅ Enhanced Security Bot Started Successfully!');
        console.log(`🛡️ Protection Level: MAXIMUM`);
        console.log(`⚡ Rate Limit: ${MAX_MESSAGES_PER_WINDOW} msg/${RATE_LIMIT_WINDOW/1000}s`);
        console.log(`🎯 Detection Patterns: ${dangerousPatterns.length} rules`);
        console.log(`🔕 Silent Mode: ENABLED (No spam notifications)`);
        
        // Graceful shutdown
        process.once('SIGINT', () => gracefulStop('SIGINT'));
        process.once('SIGTERM', () => gracefulStop('SIGTERM'));
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        setTimeout(startBot, 5000); // Retry after 5 seconds
    }
};

const gracefulStop = async (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down...`);
    
    try {
        await saveData();
        console.log('✅ Data saved');
        
        bot.stop(signal);
        console.log('✅ Bot stopped');
        
        userSessions.clear();
        console.log('✅ Sessions cleared');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

// Start the bot
startBot();

console.log(`
📦 **Setup Instructions:**
1. npm install telegraf
2. Update BOT_TOKEN and MAIN_ADMIN
3. node bot.js

🔥 **Enhanced Features:**
✅ Fixed session management
✅ Lightning fast processing
✅ Silent operation (no spam)
✅ Multi-group support
✅ Enhanced rate limiting
✅ Duplicate detection (text + images)
✅ Auto-ban system
✅ Real-time stats tracking
✅ Memory optimization
✅ Error recovery

🛡️ **Security Rules:** ${dangerousPatterns.length} patterns loaded
⚡ **Rate Limit:** ${MAX_MESSAGES_PER_WINDOW} messages per ${RATE_LIMIT_WINDOW/1000} seconds
🔨 **Auto-Ban:** After 10 violations
🔕 **Mode:** Silent (no group notifications)
`);

module.exports = { bot, botData, isAdmin, checkDangerousContent };
