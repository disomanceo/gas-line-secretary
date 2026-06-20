const CONFIG = {
  SPREADSHEET_ID: '1vIMQysUl5qYeSjKjpPEv_VGiTsLrashPK7O27J-9D40',
  SCRIPT_ID: '12dCy1-vQpUOkNyGTtwlhKwO0pz7K73DcBA70zxgGf3DMzu11AH35WhQr',
  FOLDER_ID: '1jrGC9ih_lwxvcRClTaO9rTR9D06znGX8',
  SHEETS: {
    TEACHERS: 'Teachers',
    ANNOUNCEMENTS: 'Announcements',
    ACKS: 'Acknowledgements',
    SETTINGS: 'Settings'
  },
  NORMAL_PREFIXES: ['@เลขา', '/เลขา'],
  URGENT_PREFIXES: ['@ด่วน', '/ด่วน'],
  NORMAL_DEADLINE_HOURS: 3,
  URGENT_DEADLINE_HOURS: 1,
  TIMEZONE: 'Asia/Bangkok'
};

function doPost(e) {
  try {
    ensureDataStore();
    const bodyText = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(bodyText);
    const events = payload.events || [];

    events.forEach(handleLineEvent);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function setupSheets() {
  ensureDataStore();
}

function ensureDataStore() {
  const ss = getSpreadsheet();
  ensureSheet(ss, CONFIG.SHEETS.TEACHERS, [
    'teacherId',
    'displayName',
    'lineUserId',
    'role',
    'active'
  ]);
  ensureSheet(ss, CONFIG.SHEETS.ANNOUNCEMENTS, [
    'announcementId',
    'type',
    'message',
    'groupId',
    'createdByUserId',
    'createdAt',
    'deadlineAt',
    'status',
    'summarySentAt'
  ]);
  ensureSheet(ss, CONFIG.SHEETS.ACKS, [
    'ackId',
    'announcementId',
    'lineUserId',
    'displayName',
    'ackAt'
  ]);
  ensureSheet(ss, CONFIG.SHEETS.SETTINGS, ['key', 'value']);
  return ss;
}

function handleLineEvent(event) {
  if (event.type === 'message' && event.message && event.message.type === 'text') {
    handleTextMessage(event);
    return;
  }

  if (event.type === 'postback') {
    handlePostback(event);
  }
}

function handleTextMessage(event) {
  const text = (event.message.text || '').trim();
  const selfServiceCommand = parseSelfServiceCommand(text);

  if (selfServiceCommand) {
    handleSelfServiceCommand(event, selfServiceCommand);
    return;
  }

  const command = parseSecretaryCommand(text);

  if (!command) {
    return;
  }

  const prefixedSelfServiceCommand = parseSelfServiceCommand(command.message);

  if (prefixedSelfServiceCommand) {
    handleSelfServiceCommand(event, prefixedSelfServiceCommand);
    return;
  }

  if (!isAuthorizedCommander(event.source.userId)) {
    replyMessage(event.replyToken, [
      {
        type: 'text',
        text: [
          'คำสั่งนี้ใช้ได้เฉพาะผู้ที่ได้รับสิทธิ์เท่านั้นครับ',
          '',
          `userId ที่บอทเห็น: ${event.source.userId || '-'}`,
          'ให้นำค่านี้ไปใส่ใน Script property ชื่อ ADMIN_USER_IDS'
        ].join('\n')
      }
    ]);
    return;
  }

  if (!command.message) {
    replyMessage(event.replyToken, [{ type: 'text', text: 'กรุณาพิมพ์ข้อความประกาศต่อท้ายคำสั่งครับ' }]);
    return;
  }

  createAndSendAnnouncement(event, command);
}

function handlePostback(event) {
  const data = parsePostbackData(event.postback.data);

  if (data.action === 'ack') {
    acknowledgeAnnouncement(event, data.announcementId);
  }
}

function parseSecretaryCommand(text) {
  const urgentPrefix = CONFIG.URGENT_PREFIXES.find((prefix) => text.startsWith(prefix));
  if (urgentPrefix) {
    return {
      type: 'urgent',
      prefix: urgentPrefix,
      message: text.slice(urgentPrefix.length).trim(),
      deadlineHours: CONFIG.URGENT_DEADLINE_HOURS
    };
  }

  const normalPrefix = CONFIG.NORMAL_PREFIXES.find((prefix) => text.startsWith(prefix));
  if (!normalPrefix) {
    return null;
  }

  let message = text.slice(normalPrefix.length).trim();
  if (message.startsWith('ประกาศ')) {
    message = message.slice('ประกาศ'.length).trim();
  }

  return {
    type: 'normal',
    prefix: normalPrefix,
    message,
    deadlineHours: CONFIG.NORMAL_DEADLINE_HOURS
  };
}

function parseSelfServiceCommand(text) {
  const raw = String(text || '').trim();
  const normalized = raw.toLowerCase();

  if (['ช่วยเหลือ', 'help', 'วิธีใช้'].indexOf(normalized) >= 0) {
    return { type: 'help' };
  }

  if (['id', 'userid', 'user id', 'groupid', 'group id', 'ไอดี', 'รหัส'].indexOf(normalized) >= 0) {
    return { type: 'identity' };
  }

  const registerPrefixes = ['ลงทะเบียนผอ.', 'ลงทะเบียน ผอ.', 'ลงทะเบียน', 'สมัคร'];
  const registerPrefix = registerPrefixes.find((prefix) => raw.startsWith(prefix));
  if (registerPrefix) {
    return {
      type: 'register',
      displayName: raw.slice(registerPrefix.length).trim()
    };
  }

  return null;
}

function handleSelfServiceCommand(event, command) {
  if (command.type === 'help') {
    replyMessage(event.replyToken, [{ type: 'text', text: buildHelpText() }]);
    return;
  }

  if (command.type === 'identity') {
    replyMessage(event.replyToken, [{ type: 'text', text: buildIdentityText(event) }]);
    return;
  }

  if (command.type === 'register') {
    registerTeacher(event, command.displayName);
  }
}

function buildHelpText() {
  return [
    'วิธีใช้ระบบเลขา',
    '',
    'คำสั่งที่พิมพ์ได้เลย:',
    'ช่วยเหลือ',
    'ไอดี หรือ id',
    'ลงทะเบียน ครูชื่อ นามสกุล',
    'สมัคร ครูชื่อ นามสกุล',
    'ลงทะเบียน ผอ.ชื่อ นามสกุล',
    '',
    'ประกาศปกติสำหรับผู้มีสิทธิ์:',
    '/เลขา ประกาศ ข้อความ',
    '@เลขา ประกาศ ข้อความ',
    'รับทราบภายใน 3 ชม.',
    '',
    'ประกาศด่วนสำหรับผู้มีสิทธิ์:',
    '/ด่วน ข้อความ',
    '@ด่วน ข้อความ',
    'รับทราบภายใน 1 ชม.',
    '',
    'ตรวจ LINE ID:',
    'ไอดี',
    'id',
    '/เลขา id',
    '@เลขา ไอดี',
    '',
    'หมายเหตุ:',
    'ผอ. และผู้มีสิทธิ์ประกาศควรลงทะเบียนด้วย',
    'เพื่อให้ระบบแสดงชื่อถูกต้องเมื่อกดรับทราบ'
  ].join('\n');
}

function buildIdentityText(event) {
  return [
    'ข้อมูล LINE ที่บอทเห็น',
    `userId: ${event.source.userId || '-'}`,
    `groupId: ${event.source.groupId || '-'}`,
    `roomId: ${event.source.roomId || '-'}`,
    '',
    'ใช้ userId สำหรับตั้งสิทธิ์ผู้ประกาศ',
    'ใช้ groupId สำหรับตรวจสอบกลุ่ม LINE'
  ].join('\n');
}

function registerTeacher(event, displayName) {
  if (!displayName) {
    replyMessage(event.replyToken, [
      {
        type: 'text',
        text: [
          'กรุณาพิมพ์ชื่อหลังคำว่าลงทะเบียน',
          'ตัวอย่าง:',
          'ลงทะเบียน ครูสมชาย ใจดี'
        ].join('\n')
      }
    ]);
    return;
  }

  const result = upsertTeacher(event.source.userId, displayName);
  const roleText = getRoleForUser(event.source.userId) === 'director' ? 'ผอ./ผู้มีสิทธิ์ประกาศ' : 'ครู';
  const actionText = result === 'updated' ? 'อัปเดตข้อมูลเรียบร้อยแล้วครับ' : 'ลงทะเบียนเรียบร้อยแล้วครับ';

  replyMessage(event.replyToken, [
    {
      type: 'text',
      text: [
        actionText,
        `ชื่อที่ใช้แสดง: ${displayName}`,
        `ประเภทผู้ใช้: ${roleText}`,
        `userId: ${event.source.userId}`
      ].join('\n')
    }
  ]);
}

function upsertTeacher(lineUserId, displayName) {
  ensureDataStore();
  const sheet = getSheet(CONFIG.SHEETS.TEACHERS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const teacherIdIndex = headers.indexOf('teacherId');
  const displayNameIndex = headers.indexOf('displayName');
  const lineUserIdIndex = headers.indexOf('lineUserId');
  const roleIndex = headers.indexOf('role');
  const activeIndex = headers.indexOf('active');

  for (let row = 1; row < values.length; row += 1) {
    if (values[row][lineUserIdIndex] === lineUserId) {
      sheet.getRange(row + 1, displayNameIndex + 1).setValue(displayName);
      sheet.getRange(row + 1, roleIndex + 1).setValue(getRoleForUser(lineUserId));
      sheet.getRange(row + 1, activeIndex + 1).setValue(true);
      return 'updated';
    }
  }

  const nextRow = [];
  nextRow[teacherIdIndex] = createId('T');
  nextRow[displayNameIndex] = displayName;
  nextRow[lineUserIdIndex] = lineUserId;
  nextRow[roleIndex] = getRoleForUser(lineUserId);
  nextRow[activeIndex] = true;
  sheet.appendRow(nextRow);
  return 'created';
}

function getRoleForUser(userId) {
  return isAuthorizedCommander(userId) ? 'director' : 'teacher';
}

function buildAnnouncementMessage(announcementId, message, type, deadline) {
  const title = type === 'urgent' ? 'ประกาศด่วนจาก ผอ.' : 'ประกาศจาก ผอ.';
  const noteText = type === 'urgent'
    ? 'กรุณากดรับทราบภายใน 1 ชม.'
    : 'กรุณากดรับทราบภายใน 3 ชม.';

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        paddingAll: '18px',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: title,
            color: '#DC2626',
            weight: 'bold',
            size: 'lg',
            align: 'center',
            wrap: true
          },
          { type: 'text', text: message, color: '#111827', size: 'md', wrap: true }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: noteText, color: '#6B7280', size: 'xs', wrap: true },
          {
            type: 'button',
            style: 'primary',
            color: '#16A34A',
            action: {
              type: 'postback',
              label: 'รับทราบ',
              data: toPostbackData({ action: 'ack', announcementId })
            }
          }
        ]
      }
    }
  };
}

function createAndSendAnnouncement(event, command) {
  const destinationId = event.source.groupId || event.source.roomId || '';
  if (!destinationId) {
    replyMessage(event.replyToken, [{ type: 'text', text: 'กรุณาสั่งประกาศในกลุ่ม LINE ที่ต้องการส่งประกาศครับ' }]);
    return;
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + command.deadlineHours * 60 * 60 * 1000);
  const announcementId = createId('ANN');

  appendRow(CONFIG.SHEETS.ANNOUNCEMENTS, [
    announcementId,
    command.type,
    command.message,
    destinationId,
    event.source.userId,
    now,
    deadline,
    'open',
    ''
  ]);

  replyMessage(event.replyToken, [buildAnnouncementMessage(announcementId, command.message, command.type, deadline)]);
}

function acknowledgeAnnouncement(event, announcementId) {
  const userId = event.source.userId;
  const teacherName = getTeacherName(userId) || 'ครู';
  const existing = findAck(announcementId, userId);

  if (existing) {
    replyMessage(event.replyToken, [{ type: 'text', text: `${teacherName} รับทราบไว้แล้วครับ` }]);
    return;
  }

  const ackAt = new Date();
  appendRow(CONFIG.SHEETS.ACKS, [createId('ACK'), announcementId, userId, teacherName, ackAt]);

  const timeText = formatThaiDateTime(ackAt);
  replyMessage(event.replyToken, [buildAckMessage(teacherName, timeText)]);
}

function buildAckMessage(teacherName, timeText) {
  return {
    type: 'flex',
    altText: `${teacherName} รับทราบแล้ว`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: `${teacherName} รับทราบแล้ว`,
            color: '#111827',
            weight: 'bold',
            size: 'md',
            wrap: true
          },
          {
            type: 'text',
            text: timeText,
            color: '#4B5563',
            size: 'sm',
            wrap: true
          }
        ]
      }
    }
  };
}

function formatThaiDateTime(date) {
  const monthNames = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.'
  ];
  const day = Number(Utilities.formatDate(date, CONFIG.TIMEZONE, 'd'));
  const month = Number(Utilities.formatDate(date, CONFIG.TIMEZONE, 'M'));
  const buddhistYear = Number(Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy')) + 543;
  const shortYear = String(buddhistYear).slice(-2);
  const time = Utilities.formatDate(date, CONFIG.TIMEZONE, 'HH.mm');

  return `${day} ${monthNames[month - 1]} ${shortYear} เวลา ${time} น.`;
}

function checkDeadlines() {
  ensureDataStore();
  const rows = getRows(CONFIG.SHEETS.ANNOUNCEMENTS);
  const now = new Date();

  rows.forEach((row) => {
    if (row.status !== 'open' || row.summarySentAt) {
      return;
    }

    const deadline = new Date(row.deadlineAt);
    if (deadline.getTime() > now.getTime()) {
      return;
    }

    const summary = buildDeadlineSummary(row);
    pushMessage(row.groupId, [{ type: 'text', text: summary }]);
    updateAnnouncementSummarySent(row.announcementId, now);
  });
}

function buildDeadlineSummary(announcement) {
  const teachers = getActiveTeachers();
  const ackedUserIds = getAckedUserIds(announcement.announcementId);
  const missing = teachers.filter((teacher) => !ackedUserIds[teacher.lineUserId]);

  if (missing.length === 0) {
    return `สรุปการรับทราบประกาศ\n${announcement.message}\n\nครูทุกคนรับทราบแล้วครับ`;
  }

  return [
    'สรุปการรับทราบประกาศ',
    announcement.message,
    '',
    `รับทราบแล้ว ${teachers.length - missing.length} คน`,
    `ยังไม่รับทราบ ${missing.length} คน:`,
    missing.map((teacher) => teacher.displayName).join(', ')
  ].join('\n');
}

function installDeadlineTrigger() {
  ScriptApp.newTrigger('checkDeadlines')
    .timeBased()
    .everyMinutes(10)
    .create();
}

function replyMessage(replyToken, messages) {
  callLineApi('https://api.line.me/v2/bot/message/reply', {
    replyToken,
    messages
  });
}

function pushMessage(to, messages) {
  if (!to) {
    throw new Error('Missing LINE destination');
  }

  callLineApi('https://api.line.me/v2/bot/message/push', {
    to,
    messages
  });
}

function callLineApi(url, payload) {
  const token = getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${token}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`LINE API failed ${status}: ${response.getContentText()}`);
  }
}

function isAuthorizedCommander(userId) {
  const adminIds = (getProperty('ADMIN_USER_IDS') || '')
    .split(/[,，\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return adminIds.indexOf(userId) >= 0;
}

function getTeacherName(userId) {
  const teachers = getRows(CONFIG.SHEETS.TEACHERS);
  const teacher = teachers.find((row) => row.lineUserId === userId);
  return teacher ? teacher.displayName : '';
}

function getActiveTeachers() {
  return getRows(CONFIG.SHEETS.TEACHERS).filter((row) => {
    const active = String(row.active).toLowerCase() !== 'false';
    const role = String(row.role || 'teacher').toLowerCase();
    return active && role === 'teacher';
  });
}

function findAck(announcementId, userId) {
  return getRows(CONFIG.SHEETS.ACKS).find(
    (row) => row.announcementId === announcementId && row.lineUserId === userId
  );
}

function getAckedUserIds(announcementId) {
  return getRows(CONFIG.SHEETS.ACKS)
    .filter((row) => row.announcementId === announcementId)
    .reduce((result, row) => {
      result[row.lineUserId] = true;
      return result;
    }, {});
}

function updateAnnouncementSummarySent(announcementId, summarySentAt) {
  const sheet = getSheet(CONFIG.SHEETS.ANNOUNCEMENTS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf('announcementId');
  const statusIndex = headers.indexOf('status');
  const summaryIndex = headers.indexOf('summarySentAt');

  for (let row = 1; row < values.length; row += 1) {
    if (values[row][idIndex] === announcementId) {
      sheet.getRange(row + 1, statusIndex + 1).setValue('closed');
      sheet.getRange(row + 1, summaryIndex + 1).setValue(summarySentAt);
      return;
    }
  }
}

function getRows(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  return values.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index];
    });
    return record;
  });
}

function appendRow(sheetName, values) {
  getSheet(sheetName).appendRow(values);
}

function ensureSheet(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every((header, index) => firstRow[index] === header);

  if (!hasHeaders) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function getSheet(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    ensureDataStore();
    const createdSheet = getSpreadsheet().getSheetByName(sheetName);
    if (createdSheet) {
      return createdSheet;
    }
    throw new Error(`Missing sheet: ${sheetName}.`);
  }
  return sheet;
}

function getSpreadsheet() {
  const spreadsheetId = getProperty('SPREADSHEET_ID') || CONFIG.SPREADSHEET_ID;
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSpreadsheet) {
    throw new Error('Missing SPREADSHEET_ID.');
  }
  return activeSpreadsheet;
}

function parsePostbackData(data) {
  return data.split('&').reduce((result, pair) => {
    const parts = pair.split('=');
    result[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
    return result;
  }, {});
}

function toPostbackData(data) {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join('&');
}

function createId(prefix) {
  return `${prefix}_${Utilities.getUuid()}`;
}

function getProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
