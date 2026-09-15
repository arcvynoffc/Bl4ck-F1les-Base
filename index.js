const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  proto,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  getContentType,
  jidDecode,
  delay,
  Browsers,
  prepareWAMessageMedia,
  generateWAMessage,
  generateWAMessageContent,
  extractMessageContent,
  areJidsSameUser,
  WA_DEFAULT_EPHEMERAL,
  getAggregateVotesInPollMessage,
  normalizeMessageContent,
  downloadMediaMessage,
  S_WHATSAPP_NET,
  isJidUser,
  isJidGroup,
  isJidBroadcast,
  generateRegistrationId,
  encodeSignedDeviceIdentity,
  getHistoryMsg
} = require('@whiskeysockets/baileys');

const { Telegraf, Markup, Scenes, session } = require('telegraf');
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const cfg = require("./config");

const bot = new Telegraf(cfg.token);
bot.use(session());

const sockets = new Map();
const userSate = new Map();
const usePairing = true;

async function connectToWA(phoneNumber, ctx = null) {
    const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
    const sessionPath = path.join(__dirname, 'sessions', `session_${cleanNum}`);
    await fs.ensureDir(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        auth: state,
        printQRInTerminal: !usePairing,
        markOnlineOnConnection: true,
        browser: Browsers.ubuntu("Chrome")
    });

    sockets.set(cleanNum, sock);
    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered && usePairing && ctx) {
        await delay(3000);

        try {
            const code = await sock.requestPairingCode(cleanNum, "BL4CKXXX");
            if (ctx && (ctx.reply || ctx.replyWithPhoto)) {
                const captionText = `<pre>╭─────⧼ Code ⧽
│ ${code}
╰────────

Masukkan kode ini di aplikasi WhatsApp HP Anda (Perangkat Tertaut > Tautkan dengan nomor telepon).</pre>`;
                const extraOptions = {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [{ text: '📋 Copy Kode', copy_text: { text: code } }]
                    ])
                };

                if (cfg.thumb) {
                    await ctx.replyWithPhoto(cfg.thumb, { caption: captionText, ...extraOptions });
                } else {
                    await ctx.reply(captionText, extraOptions);
                }
            }
        } catch (err) {
            if (ctx && ctx.reply) {
                await ctx.reply(`<pre>Gagal mengambil kode pairing untuk ${cleanNum}: ${escapeHTML(err.message)}</pre>`, { parse_mode: 'HTML' });
            }
            sockets.delete(cleanNum);
            return;
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWA(cleanNum, ctx);
            } else {
                sockets.delete(cleanNum);
                await fs.remove(sessionPath).catch(() => {});
                if (ctx && ctx.reply) {
                    await ctx.reply(`<pre>Sesi WhatsApp ${cleanNum} terputus dan folder sesi telah dihapus.</pre>`, { parse_mode: 'HTML' });
                }
            }
        } else if (connection === 'open') {
            if (ctx && ctx.reply) {
                await ctx.reply(`<pre>WhatsApp (${cleanNum}) Berhasil Terhubung!</pre>`, { parse_mode: 'HTML' });
            }
        }
    });

    return sock;
}

async function initAllSessions() {
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) return;

    const folders = await fs.readdir(sessionsDir);
    for (const folder of folders) {
        if (folder.startsWith('session_')) {
            const cleanNum = folder.replace('session_', '');
            await connectToWA(cleanNum);
        }
    }
}

const databaseDir = path.join(__dirname, "database");
fs.ensureDirSync(databaseDir);
const premiumPath = path.join(databaseDir, "premium.json");
const murbugPath = path.join(databaseDir, "murbug.json");

if (!fs.existsSync(premiumPath)) fs.writeJsonSync(premiumPath, []);
if (!fs.existsSync(murbugPath)) fs.writeJsonSync(murbugPath, []);

function isOwner(id) {
    if (Array.isArray(cfg.ownerId)) {
        return cfg.ownerId.map(String).includes(String(id));
    }
    return String(id) === String(cfg.ownerId);
}

function isPrem(id) {
    const db = fs.readJsonSync(premiumPath, { throws: false }) || [];
    return db.map(String).includes(String(id)) || isOwner(id);
}

function isMurbug(id) {
    const db = fs.readJsonSync(murbugPath, { throws: false }) || [];
    return db.map(String).includes(String(id)) || isOwner(id);
}

function addPrem(id) {
    const db = fs.readJsonSync(premiumPath, { throws: false }) || [];
    const strId = String(id);
    if (!db.includes(strId)) {
        db.push(strId);
        fs.writeJsonSync(premiumPath, db, { spaces: 2 });
        return true;
    }
    return false;
}

function delPrem(id) {
    let db = fs.readJsonSync(premiumPath, { throws: false }) || [];
    const strId = String(id);
    if (db.includes(strId)) {
        db = db.filter(userId => userId !== strId);
        fs.writeJsonSync(premiumPath, db, { spaces: 2 });
        return true;
    }
    return false;
}

function listPrem() {
    return fs.readJsonSync(premiumPath, { throws: false }) || [];
}

function addMurbug(id) {
    const db = fs.readJsonSync(murbugPath, { throws: false }) || [];
    const strId = String(id);
    if (!db.includes(strId)) {
        db.push(strId);
        fs.writeJsonSync(murbugPath, db, { spaces: 2 });
        return true;
    }
    return false;
}

function delMurbug(id) {
    let db = fs.readJsonSync(murbugPath, { throws: false }) || [];
    const strId = String(id);
    if (db.includes(strId)) {
        db = db.filter(userId => userId !== strId);
        fs.writeJsonSync(murbugPath, db, { spaces: 2 });
        return true;
    }
    return false;
}

function listMurbug() {
    return fs.readJsonSync(murbugPath, { throws: false }) || [];
}

function getRole(id) {
    const strId = String(id);
    if (isOwner(strId)) return "Owner";

    const premDb = (fs.readJsonSync(premiumPath, { throws: false }) || []).map(String);
    const murbugDb = (fs.readJsonSync(murbugPath, { throws: false }) || []).map(String);

    const inPrem = premDb.includes(strId);
    const inMurbug = murbugDb.includes(strId);

    if (inPrem && inMurbug) return "Premium & Murbug";
    if (inPrem) return "Premium";
    if (inMurbug) return "Murbug";

    return "User";
}

function escapeHTML(str) {
    if (!str) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(str).replace(/[&<>"']/g, (match) => map[match]);
}

function getRuntime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const dDisplay = d > 0 ? `${d}d ` : '';
    const hDisplay = h > 0 ? `${h}h ` : '';
    const mDisplay = m > 0 ? `${m}m ` : '';
    const sDisplay = `${s}s`;

    return (dDisplay + hDisplay + mDisplay + sDisplay).trim();
}

function caption(text = '') {
    const currentRuntime = getRuntime(process.uptime());
    const header = `╭────────⧼ ʙᴏᴛ ɪɴғᴏʀᴍᴀᴛɪᴏɴ ⧽
│ > Bot Name: ${cfg.botName}
│ > Version: 0.0.1
│ > Prefix: "/"
│ > Runtime: ${currentRuntime}
╰────────────`;
    const fullText = text ? `${header}\n${text}` : header;
    return `<pre>${escapeHTML(fullText)}</pre>`;
}

function btnStart() {
    return {
        inline_keyboard: [
            [
                {
                    text: "ᴏᴘᴇɴ ᴍᴇɴᴜ",
                    callback_data: "menu",
                    style: "success"
                },
                {
                    text: "ᴏᴡɴᴇʀ",
                    url: `https://t.me/${cfg.ownerName}`,
                    style: "danger"
                }
            ]
        ]
    };
}

function btnHome() {
    return {
        inline_keyboard: [
            [
                {
                    text: "ʙʟᴀᴄᴋ ғɪʟᴇꜱ",
                    callback_data: "black",
                    style: "danger"
                }
            ],
            [
                {
                    text: "ꜱᴇɴᴅᴇʀ ᴍᴇɴᴜ",
                    callback_data: "sender",
                    style: "success"
                },
                {
                    text: "ᴛᴏᴏʟꜱ ᴍᴇɴᴜ",
                    callback_data: "tools",
                    style: "primary"
                }
            ],
            [
                {
                    text: "ᴏᴡɴᴇʀ ᴍᴇɴᴜ",
                    callback_data: "owner",
                    style: "danger"
                }
            ]
        ]
    }
}

function btnBlck() {
    return {
        inline_keyboard: [
            [
                {
                    text: "ʙᴀᴄᴋ",
                    callback_data: "menu",
                    style: "danger"
                }
            ],
            [
                {
                    text: "ᴛᴏᴏʟꜱ ᴍᴇɴᴜ",
                    callback_data: "tools",
                    style: "success"
                },
                {
                    text: "ꜱᴇɴᴅᴇʀ ᴍᴇɴᴜ",
                    callback_data: "sender",
                    style: "primary"
                }
            ]
        ]
    }
}

function btnTools() {
    return {
        inline_keyboard: [
            [
                {
                    text: "ʙᴀᴄᴋ",
                    callback_data: "menu",
                    style: "danger"
                }
            ],
            [
                {
                    text: "ʙʟᴀᴄᴋ ғɪʟᴇꜱ",
                    callback_data: "black",
                    style: "danger"
                },
                {
                    text: "ꜱᴇɴᴅᴇʀ ᴍᴇɴᴜ",
                    callback_data: "sender",
                    style: "primary"
                }
            ]
        ]
    }
}

function btnSender() {
    return {
        inline_keyboard: [
            [
                {
                    text: "ʙᴀᴄᴋ",
                    callback_data: "menu",
                    style: "danger"
                }
            ],
            [
                {
                    text: "ʙʟᴀᴄᴋ ғɪʟᴇꜱ",
                    callback_data: "black",
                    style: "danger"
                },
                {
                    text: "ᴛᴏᴏʟꜱ ᴍᴇɴᴜ",
                    callback_data: "tools",
                    style: "success"
                }
            ]
        ]
    }
}

function btnOwner() {
    return {
        inline_keyboard: [
            [
                {
                    text: "ʙᴀᴄᴋ",
                    callback_data: "menu",
                    style: "danger"
                }
            ],
            [
                {
                    text: "ʙʟᴀᴄᴋ ғɪʟᴇꜱ",
                    callback_data: "black",
                    style: "danger"
                },
                {
                    text: "ᴛᴏᴏʟꜱ ᴍᴇɴᴜ",
                    callback_data: "tools",
                    style: "success"
                }
            ],
            [
                {
                    text: "ꜱᴇɴᴅᴇʀ ᴍᴇɴᴜ",
                    callback_data: "sender",
                    style: "primary"
                }
            ]
        ]
    }
}

bot.start(async (ctx) => {
    await ctx.replyWithVideo(cfg.thumb, {
        caption: caption(),
        parse_mode: "HTML",
        reply_markup: btnStart()
    });
});

bot.action("menu", async (ctx) => {
    const userRole = getRole(ctx?.from?.id);
    const name = ctx?.from?.first_name || 'User';
    const username = ctx?.from?.username ? `@${ctx.from.username}` : name;

    try {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.deleteMessage().catch(() => {});
    } catch (err) {
        console.log(err);
    }

    const userInfoText = `╭────────⧼ ᴜꜱᴇʀ ɪɴғᴏ ⧽
│ > Name: ${username}
│ > ID: ${ctx?.from?.id}
│ > Role: ${userRole}
╰────────────`;

    await ctx.replyWithVideo(cfg.thumb, {
        caption: caption(userInfoText),
        parse_mode: "HTML",
        reply_markup: btnHome()
    });
});

bot.action("black", async (ctx) => {
    try {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.deleteMessage().catch(() => {});
    } catch (err) {
        console.log(err);
    }

    const text = `╭────────⧼ ʙʟᴀᴄᴋ ғɪʟᴇꜱ ⧽
│ > /send - Kirim pesan WA
│ > /pair - Hubungkan sesi WA
╰────────────`;

    await ctx.replyWithVideo(cfg.thumb, {
        caption: caption(text),
        parse_mode: "HTML",
        reply_markup: btnBlck()
    });
});

bot.action("tools", async (ctx) => {
    try {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.deleteMessage().catch(() => {});
    } catch (err) {
        console.log(err);
    }

    const text = `╭────────⧼ ᴛᴏᴏʟꜱ ᴍᴇɴᴜ ⧽
│ > /pair - Tambah sender WA
│ > /listsender - Daftar sender WA
│ > /delsender - Hapus sender WA
╰────────────`;

    await ctx.replyWithVideo(cfg.thumb, {
        caption: caption(text),
        parse_mode: "HTML",
        reply_markup: btnTools()
    });
});

bot.action("sender", async (ctx) => {
    try {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.deleteMessage().catch(() => {});
    } catch (err) {
        console.log(err);
    }

    const text = `╭────────⧼ ꜱᴇɴᴅᴇʀ ᴍᴇɴᴜ ⧽
│ > /listsender - List sender aktif
│ > /delsender - Hapus sender aktif
│ > /send - Kirim pesan ke nomor WA
╰────────────`;

    await ctx.replyWithVideo(cfg.thumb, {
        caption: caption(text),
        parse_mode: "HTML",
        reply_markup: btnSender()
    });
});

bot.action("owner", async (ctx) => {
    if (!isOwner(ctx.from.id)) {
        return ctx.answerCbQuery("Khusus Owner!", { show_alert: true }).catch(() => {});
    }

    try {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.deleteMessage().catch(() => {});
    } catch (err) {
        console.log(err);
    }

    const text = `╭────────⧼ ᴏᴡɴᴇʀ ᴍᴇɴᴜ ⧽
│ > /addprem - Tambah user Premium
│ > /delprem - Hapus user Premium
│ > /listprem - List user Premium
│ > /addmurbug - Tambah user Murbug
│ > /delmurbug - Hapus user Murbug
│ > /listmurbug - List user Murbug
╰────────────`;

    await ctx.replyWithVideo(cfg.thumb, {
        caption: caption(text),
        parse_mode: "HTML",
        reply_markup: btnOwner()
    });
});

bot.command('pair', (ctx) => {
    userSate.set(ctx.from.id, { step: 'WAITING_NUMBER' });
    ctx.reply('<pre>Masukan Nomor Anda: </pre>', {
        parse_mode: "HTML"
    });
});

bot.command('listsender', async (ctx) => {
    if (sockets.size === 0) {
        return ctx.reply('<pre>Belum ada sender WhatsApp yang terhubung.</pre>', { parse_mode: 'HTML' });
    }

    let captionText = '╭─────⧼ List Sender ⧽\n';
    for (const [num] of sockets) {
        captionText += `│ ${num}\n`;
    }
    captionText += '╰────────';

    const extraOptions = { parse_mode: 'HTML' };
    const htmlText = `<pre>${escapeHTML(captionText)}</pre>`;

    if (cfg.thumb) {
        await ctx.replyWithPhoto(cfg.thumb, { caption: htmlText, ...extraOptions });
    } else {
        await ctx.reply(htmlText, extraOptions);
    }
});

bot.command('delsender', async (ctx) => {
    if (sockets.size === 0) {
        return ctx.reply('<pre>Belum ada sender WhatsApp yang terhubung.</pre>', { parse_mode: 'HTML' });
    }

    const args = ctx.message.text.split(' ').slice(1);
    const inputNum = args[0] ? args[0].replace(/[^0-9]/g, '') : null;

    if (!inputNum) {
        userSate.set(ctx.from.id, { step: 'WAITING_DEL_NUMBER' });
        return ctx.reply('<pre>Masukkan nomor WhatsApp sender yang ingin dihapus (contoh: 628123456789):</pre>', { parse_mode: 'HTML' });
    }

    if (!sockets.has(inputNum)) {
        return ctx.reply(`<pre>Nomor ${inputNum} tidak ditemukan di daftar sender aktif.</pre>`, { parse_mode: 'HTML' });
    }

    const sock = sockets.get(inputNum);
    try {
        await sock.logout().catch(() => {});
        sock.end();
    } catch (e) {}

    sockets.delete(inputNum);
    const sessionPath = path.join(__dirname, 'sessions', `session_${inputNum}`);
    await fs.remove(sessionPath).catch(() => {});

    return ctx.reply(`<pre>Sesi WhatsApp ${inputNum} berhasil dihapus.</pre>`, { parse_mode: 'HTML' });
});

bot.command('addprem', (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply('<pre>Khusus Owner!</pre>', { parse_mode: 'HTML' });

    const args = ctx.message.text.split(' ').slice(1);
    const targetId = ctx.message.reply_to_message?.from?.id || args[0];

    if (!targetId) return ctx.reply('<pre>Penggunaan: /addprem <ID_Telegram> atau reply pesannya.</pre>', { parse_mode: 'HTML' });

    const success = addPrem(targetId);
    if (success) {
        ctx.reply(`<pre>Berhasil menambahkan ID ${targetId} ke daftar Premium.</pre>`, { parse_mode: 'HTML' });
    } else {
        ctx.reply(`<pre>ID ${targetId} sudah ada di daftar Premium.</pre>`, { parse_mode: 'HTML' });
    }
});

bot.command('delprem', (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply('<pre>Khusus Owner!</pre>', { parse_mode: 'HTML' });

    const args = ctx.message.text.split(' ').slice(1);
    const targetId = ctx.message.reply_to_message?.from?.id || args[0];

    if (!targetId) return ctx.reply('<pre>Penggunaan: /delprem <ID_Telegram> atau reply pesannya.</pre>', { parse_mode: 'HTML' });

    const success = delPrem(targetId);
    if (success) {
        ctx.reply(`<pre>Berhasil menghapus ID ${targetId} dari daftar Premium.</pre>`, { parse_mode: 'HTML' });
    } else {
        ctx.reply(`<pre>ID ${targetId} tidak ditemukan di daftar Premium.</pre>`, { parse_mode: 'HTML' });
    }
});

bot.command('listprem', (ctx) => {
    const list = listPrem();
    if (list.length === 0) return ctx.reply('<pre>Belum ada user Premium.</pre>', { parse_mode: 'HTML' });

    let text = '╭─────⧼ List Premium ⧽\n';
    list.forEach((id) => {
        text += `│ ${id}\n`;
    });
    text += '╰────────';

    ctx.reply(`<pre>${escapeHTML(text)}</pre>`, { parse_mode: 'HTML' });
});

bot.command('addmurbug', (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply('<pre>Khusus Owner!</pre>', { parse_mode: 'HTML' });

    const args = ctx.message.text.split(' ').slice(1);
    const targetId = ctx.message.reply_to_message?.from?.id || args[0];

    if (!targetId) return ctx.reply('<pre>Penggunaan: /addmurbug <ID_Telegram> atau reply pesannya.</pre>', { parse_mode: 'HTML' });

    const success = addMurbug(targetId);
    if (success) {
        ctx.reply(`<pre>Berhasil menambahkan ID ${targetId} ke daftar Murbug.</pre>`, { parse_mode: 'HTML' });
    } else {
        ctx.reply(`<pre>ID ${targetId} sudah ada di daftar Murbug.</pre>`, { parse_mode: 'HTML' });
    }
});

bot.command('delmurbug', (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply('<pre>Khusus Owner!</pre>', { parse_mode: 'HTML' });

    const args = ctx.message.text.split(' ').slice(1);
    const targetId = ctx.message.reply_to_message?.from?.id || args[0];

    if (!targetId) return ctx.reply('<pre>Penggunaan: /delmurbug <ID_Telegram> atau reply pesannya.</pre>', { parse_mode: 'HTML' });

    const success = delMurbug(targetId);
    if (success) {
        ctx.reply(`<pre>Berhasil menghapus ID ${targetId} dari daftar Murbug.</pre>`, { parse_mode: 'HTML' });
    } else {
        ctx.reply(`<pre>ID ${targetId} tidak ditemukan di daftar Murbug.</pre>`, { parse_mode: 'HTML' });
    }
});

bot.command('listmurbug', (ctx) => {
    const list = listMurbug();
    if (list.length === 0) return ctx.reply('<pre>Belum ada user Murbug.</pre>', { parse_mode: 'HTML' });

    let text = '╭─────⧼ List Murbug ⧽\n';
    list.forEach((id) => {
        text += `│ ${id}\n`;
    });
    text += '╰────────';

    ctx.reply(`<pre>${escapeHTML(text)}</pre>`, { parse_mode: 'HTML' });
});

bot.on('text', async (ctx, next) => {
    const state = userSate.get(ctx.from.id);

    if (state && state.step === 'WAITING_NUMBER') {
        const phoneNumber = ctx.message.text;
        userSate.delete(ctx.from.id);

        await ctx.reply('<pre>Sedang meminta kode pairing dari WhatsApp...</pre>', { parse_mode: 'HTML' });
        await connectToWA(phoneNumber, ctx);
        return;
    }

    if (state && state.step === 'WAITING_DEL_NUMBER') {
        const cleanNum = ctx.message.text.replace(/[^0-9]/g, '');
        userSate.delete(ctx.from.id);

        if (!sockets.has(cleanNum)) {
            return ctx.reply(`<pre>Nomor ${cleanNum} tidak ditemukan di daftar sender aktif.</pre>`, { parse_mode: 'HTML' });
        }

        const sock = sockets.get(cleanNum);
        try {
            await sock.logout().catch(() => {});
            sock.end();
        } catch (e) {}

        sockets.delete(cleanNum);
        const sessionPath = path.join(__dirname, 'sessions', `session_${cleanNum}`);
        await fs.remove(sessionPath).catch(() => {});

        return ctx.reply(`<pre>Sesi WhatsApp ${cleanNum} berhasil dihapus.</pre>`, { parse_mode: 'HTML' });
    }

    return next();
});

bot.command('send', async (ctx) => {
    if (sockets.size === 0) {
        return ctx.reply('<pre>Belum ada sender WhatsApp yang terhubung.</pre>', { parse_mode: 'HTML' });
    }

    const args = ctx.message.text.split(' ').slice(1).join(' ');
    if (!args.includes('|')) {
        return ctx.reply('<pre>Format: /send nomor_tujuan|pesan\nContoh: /send 628123456789|Halo dari bot Telegram</pre>', { parse_mode: 'HTML' });
    }

    const [rawTarget, ...msgParts] = args.split('|');
    const targetNum = rawTarget.replace(/[^0-9]/g, '');
    const messageText = msgParts.join('|').trim();

    if (!targetNum || !messageText) {
        return ctx.reply('<pre>Nomor tujuan dan pesan tidak boleh kosong.</pre>', { parse_mode: 'HTML' });
    }

    const activeSenders = Array.from(sockets.keys());
    const senderNum = activeSenders[0];
    const sock = sockets.get(senderNum);

    try {
        const jid = targetNum.endsWith('@s.whatsapp.net') || targetNum.endsWith('@g.us') ? targetNum : `${targetNum}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: messageText });
        await ctx.reply(`<pre>Pesan berhasil dikirim ke ${targetNum} via sender ${senderNum}!</pre>`, { parse_mode: 'HTML' });
    } catch (err) {
        await ctx.reply(`<pre>Gagal mengirim pesan: ${escapeHTML(err.message)}</pre>`, { parse_mode: 'HTML' });
    }
});

initAllSessions().then(() => {
    bot.launch().then(console.log(chalk.green.bold(`Bot Berhasil Run...`)));
});