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
  REMINDER_BEFORE_MINUTES: 5,
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
    'reminderSentAt',
    'summarySentAt'
  ]);
  ensureSheet(ss, CONFIG.SHEETS.ACKS, [
    'ackId',
    'announcementId',
    'lineUserId',
    'displayName',
    'ackAt',
    'ackStatus'
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

  appendRecord(CONFIG.SHEETS.ANNOUNCEMENTS, {
    announcementId,
    type: command.type,
    message: command.message,
    groupId: destinationId,
    createdByUserId: event.source.userId,
    createdAt: now,
    deadlineAt: deadline,
    status: 'open',
    reminderSentAt: '',
    summarySentAt: ''
  });

  replyMessage(event.replyToken, [buildAnnouncementMessage(announcementId, command.message, command.type, deadline)]);
}

function acknowledgeAnnouncement(event, announcementId) {
  const userId = event.source.userId;
  const teacherName = getTeacherName(userId) || 'ครู';
  const existing = findAck(announcementId, userId);
  const announcement = getAnnouncementById(announcementId);

  if (existing) {
    return;
  }

  const ackAt = new Date();
  const ackStatus = announcement && new Date(announcement.deadlineAt).getTime() < ackAt.getTime() ? 'late' : 'on_time';
  appendRecord(CONFIG.SHEETS.ACKS, {
    ackId: createId('ACK'),
    announcementId,
    lineUserId: userId,
    displayName: teacherName,
    ackAt,
    ackStatus
  });

  const timeText = formatThaiDateTime(ackAt);
  replyMessage(event.replyToken, [buildAckMessage(teacherName, timeText, ackStatus)]);
}

function buildAckMessage(teacherName, timeText, ackStatus) {
  const title = ackStatus === 'late'
    ? `${teacherName} รับทราบแล้วหลังครบกำหนด`
    : `${teacherName} รับทราบแล้ว`;

  return {
    type: 'flex',
    altText: title,
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
            text: title,
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
    const millisecondsLeft = deadline.getTime() - now.getTime();
    const status = buildAnnouncementStatus(row);

    if (millisecondsLeft > 0) {
      const reminderWindow = CONFIG.REMINDER_BEFORE_MINUTES * 60 * 1000;
      if (!row.reminderSentAt && millisecondsLeft <= reminderWindow && status.missing.length > 0) {
        pushMessage(row.groupId, [buildReminderMessage(row, status)]);
        updateAnnouncementReminderSent(row.announcementId, now);
      }
      return;
    }

    pushMessage(row.groupId, [buildDeadlineSummaryMessage(row, status)]);
    updateAnnouncementSummarySent(row.announcementId, now);
  });
}

function buildAnnouncementStatus(announcement) {
  const teachers = getActiveTeachers();
  const ackRecords = getAckRecordsByAnnouncement(announcement.announcementId);
  const ackedByUserId = ackRecords.reduce((result, ack) => {
    result[ack.lineUserId] = ack;
    return result;
  }, {});
  const missing = teachers.filter((teacher) => !ackedByUserId[teacher.lineUserId]);
  const onTime = teachers.filter((teacher) => ackedByUserId[teacher.lineUserId]?.ackStatus !== 'late' && ackedByUserId[teacher.lineUserId]);
  const late = teachers.filter((teacher) => ackedByUserId[teacher.lineUserId]?.ackStatus === 'late');

  return { teachers, missing, onTime, late };
}

function buildReminderMessage(announcement, status) {
  const names = formatNameList(status.missing);

  return buildStatusFlexMessage({
    title: 'แจ้งเตือนก่อนครบกำหนด',
    titleColor: '#D97706',
    message: announcement.message,
    lines: [
      `เหลืออีกประมาณ ${CONFIG.REMINDER_BEFORE_MINUTES} นาที`,
      'ครูที่ยังไม่รับทราบ กรุณากดรับทราบด้วยครับ',
      '',
      `ยังไม่รับทราบ ${status.missing.length} คน`,
      names
    ]
  });
}

function buildDeadlineSummaryMessage(announcement, status) {
  return buildStatusFlexMessage({
    title: 'ครบกำหนดรับทราบแล้ว',
    titleColor: '#DC2626',
    message: announcement.message,
    lines: [
      `รับทราบตรงเวลา ${status.onTime.length} คน`,
      `รับทราบล่าช้า ${status.late.length} คน`,
      `ยังไม่รับทราบ ${status.missing.length} คน`,
      '',
      status.missing.length > 0 ? 'รายชื่อที่ยังไม่รับทราบ:' : 'ครูทุกคนรับทราบแล้วครับ',
      status.missing.length > 0 ? formatNameList(status.missing) : ''
    ]
  });
}

function buildStatusFlexMessage(options) {
  return {
    type: 'flex',
    altText: options.title,
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
            text: options.title,
            color: options.titleColor,
            weight: 'bold',
            size: 'lg',
            align: 'center',
            wrap: true
          },
          { type: 'text', text: options.message, color: '#111827', size: 'md', wrap: true },
          {
            type: 'text',
            text: options.lines.filter(Boolean).join('\n'),
            color: '#374151',
            size: 'sm',
            wrap: true
          }
        ]
      }
    }
  };
}

function formatNameList(teachers) {
  if (teachers.length === 0) {
    return '';
  }

  const visibleNames = teachers.slice(0, 15).map((teacher) => teacher.displayName);
  const hiddenCount = teachers.length - visibleNames.length;
  const suffix = hiddenCount > 0 ? `\nและอีก ${hiddenCount} คน` : '';
  return `${visibleNames.join('\n')}${suffix}`;
}

function installDeadlineTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'checkDeadlines')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('checkDeadlines')
    .timeBased()
    .everyMinutes(5)
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

function getAnnouncementById(announcementId) {
  return getRows(CONFIG.SHEETS.ANNOUNCEMENTS).find((row) => row.announcementId === announcementId);
}

function getAckRecordsByAnnouncement(announcementId) {
  return getRows(CONFIG.SHEETS.ACKS).filter((row) => row.announcementId === announcementId);
}

function updateAnnouncementReminderSent(announcementId, reminderSentAt) {
  updateAnnouncementFields(announcementId, { reminderSentAt });
}

function updateAnnouncementSummarySent(announcementId, summarySentAt) {
  updateAnnouncementFields(announcementId, { status: 'closed', summarySentAt });
}

function updateAnnouncementFields(announcementId, fields) {
  const sheet = getSheet(CONFIG.SHEETS.ANNOUNCEMENTS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf('announcementId');

  for (let row = 1; row < values.length; row += 1) {
    if (values[row][idIndex] === announcementId) {
      Object.keys(fields).forEach((fieldName) => {
        const fieldIndex = headers.indexOf(fieldName);
        if (fieldIndex >= 0) {
          sheet.getRange(row + 1, fieldIndex + 1).setValue(fields[fieldName]);
        }
      });
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

function appendRecord(sheetName, record) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getDataRange().getValues()[0];
  const row = headers.map((header) => Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '');
  sheet.appendRow(row);
}

function ensureSheet(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const firstRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const existingHeaders = firstRow.map((header) => String(header || '').trim()).filter(Boolean);

  if (existingHeaders.length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const missingHeaders = headers.filter((header) => existingHeaders.indexOf(header) < 0);
  if (missingHeaders.length > 0) {
    sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }

  sheet.setFrozenRows(1);
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
