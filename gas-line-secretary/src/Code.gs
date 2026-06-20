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
  const command = parseSecretaryCommand(text);

  if (!command) {
    return;
  }

  if (!isAuthorizedCommander(event.source.userId)) {
    replyMessage(event.replyToken, [{ type: 'text', text: 'คำสั่งนี้ใช้ได้เฉพาะผู้ที่ได้รับสิทธิ์เท่านั้นครับ' }]);
    return;
  }

  if (!command.message) {
    replyMessage(event.replyToken, [{ type: 'text', text: 'กรุณาพิมพ์ข้อความประกาศต่อท้ายคำสั่งครับ' }]);
    return;
  }

  const previewId = createPreviewId();
  CacheService.getScriptCache().put(
    previewId,
    JSON.stringify({
      type: command.type,
      message: command.message,
      groupId: event.source.groupId || event.source.roomId || '',
      createdByUserId: event.source.userId
    }),
    600
  );

  replyMessage(event.replyToken, [buildConfirmationMessage(previewId, command)]);
}

function handlePostback(event) {
  const data = parsePostbackData(event.postback.data);

  if (data.action === 'confirm') {
    confirmAnnouncement(event, data.previewId);
    return;
  }

  if (data.action === 'cancel') {
    replyMessage(event.replyToken, [{ type: 'text', text: 'ยกเลิกประกาศแล้วครับ' }]);
    return;
  }

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

function buildConfirmationMessage(previewId, command) {
  const title = command.type === 'urgent' ? 'ตรวจสอบประกาศด่วน' : 'ตรวจสอบประกาศ';
  const deadlineText = command.type === 'urgent' ? '1 ชม.' : '3 ชม.';

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
          { type: 'text', text: command.message, wrap: true },
          { type: 'text', text: `ต้องการส่งให้ครูรับทราบภายใน ${deadlineText} หรือไม่?`, size: 'sm', color: '#555555', wrap: true }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'postback',
              label: 'ยืนยันส่ง',
              data: toPostbackData({ action: 'confirm', previewId })
            }
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: 'ยกเลิก',
              data: toPostbackData({ action: 'cancel' })
            }
          }
        ]
      }
    }
  };
}

function buildAnnouncementMessage(announcementId, message, type, deadline) {
  const title = type === 'urgent' ? 'ประกาศด่วนจาก ผอ.' : 'ประกาศจาก ผอ.';
  const deadlineText = Utilities.formatDate(deadline, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
          { type: 'text', text: message, wrap: true },
          { type: 'text', text: `กรุณากดรับทราบภายใน ${deadlineText}`, size: 'sm', color: '#555555', wrap: true }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
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

function confirmAnnouncement(event, previewId) {
  const rawPreview = CacheService.getScriptCache().get(previewId);
  if (!rawPreview) {
    replyMessage(event.replyToken, [{ type: 'text', text: 'รายการรอยืนยันหมดอายุแล้ว กรุณาสั่งประกาศใหม่ครับ' }]);
    return;
  }

  const preview = JSON.parse(rawPreview);
  if (!preview.groupId) {
    replyMessage(event.replyToken, [{ type: 'text', text: 'กรุณาสั่งประกาศในกลุ่ม LINE ที่ต้องการส่งประกาศครับ' }]);
    return;
  }

  const hours = preview.type === 'urgent' ? CONFIG.URGENT_DEADLINE_HOURS : CONFIG.NORMAL_DEADLINE_HOURS;
  const now = new Date();
  const deadline = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const announcementId = createId('ANN');

  appendRow(CONFIG.SHEETS.ANNOUNCEMENTS, [
    announcementId,
    preview.type,
    preview.message,
    preview.groupId,
    preview.createdByUserId,
    now,
    deadline,
    'open',
    ''
  ]);

  replyMessage(event.replyToken, [{ type: 'text', text: 'รับทราบครับ กำลังส่งประกาศให้ครูทุกคน' }]);
  pushMessage(preview.groupId, [buildAnnouncementMessage(announcementId, preview.message, preview.type, deadline)]);
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

  const timeText = Utilities.formatDate(ackAt, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
  replyMessage(event.replyToken, [{ type: 'text', text: `${teacherName} รับทราบแล้ว\nเวลา ${timeText}` }]);
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
    .split(',')
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
  return getRows(CONFIG.SHEETS.TEACHERS).filter((row) => String(row.active).toLowerCase() !== 'false');
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

function createPreviewId() {
  return createId('PREVIEW');
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
