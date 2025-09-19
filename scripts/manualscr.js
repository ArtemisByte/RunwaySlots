/******************************************
 PERSISTENT LOGGING FUNCTIONS
******************************************/
const STORAGE_KEY = "historicLog";

function getHistoricLog() {
  const logData = localStorage.getItem(STORAGE_KEY);
  return logData ? JSON.parse(logData) : [];
}

function setHistoricLog(logEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logEntries));
}

function addLogEntry(entry) {
  const logEntries = getHistoricLog();
  logEntries.push(entry);
  setHistoricLog(logEntries);
  console.log("Log entry added:", entry);
}

/******************************************
 THEME TOGGLE
******************************************/
const themeToggle = document.getElementById('themeToggle');
const bodyElem = document.body;
const savedTheme = localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

function applyTheme(theme) {
  if (theme === 'dark') {
    bodyElem.classList.add('dark-mode');
    if (themeToggle) themeToggle.checked = true;
  } else {
    bodyElem.classList.remove('dark-mode');
    if (themeToggle) themeToggle.checked = false;
  }
}

if (themeToggle) {
  themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
      localStorage.setItem('theme', 'dark');
      applyTheme('dark');
    } else {
      localStorage.setItem('theme', 'light');
      applyTheme('light');
    }
  });
}

/******************************************
 GLOBAL / LOG / EMAILS
******************************************/
const formsContainer = document.getElementById('formsContainer');
let airportEmails = {};

/******************************************
 Load emails data from Firebase Realtime Database
******************************************/
function loadEmailData() {
  // Firebase is available globally because firebase.js already initialized it
  firebase.database().ref('airports').once('value')
    .then(snapshot => {
      airportEmails = snapshot.val();
      console.log("Loaded airport emails from Firebase:", airportEmails);
    })
    .catch(error => {
      console.error("Error fetching emails from Firebase:", error);
      alert("Could not load airport emails from Firebase. Email functionality may be limited.");
    });
}

window.addEventListener('DOMContentLoaded', () => {
  loadEmailData();
});

/******************************************
 BACK TO TOP SCROLL
******************************************/
window.onscroll = function () {
  const backToTopButton = document.getElementById('backToTop');
  if (document.documentElement.scrollTop > 200 || document.body.scrollTop > 200) {
    backToTopButton.style.display = 'block';
  } else {
    backToTopButton.style.display = 'none';
  }
};
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/******************************************
 ADD/REMOVE FORMS
******************************************/
function addNewSlotForm() {
  const template = document.getElementById('newSlotTemplate');
  const clone = template.content.cloneNode(true);
  formsContainer.appendChild(clone);
}
function addCancelSlotForm() {
  const template = document.getElementById('cancelSlotTemplate');
  const clone = template.content.cloneNode(true);
  formsContainer.appendChild(clone);
}
function addChangeScrForm() {
  const template = document.getElementById('changeScrTemplate');
  const clone = template.content.cloneNode(true);
  formsContainer.appendChild(clone);
}

function removeForm(btn) {
  const parent = btn.closest('.scr-form') || btn.closest('.change-scr-container');
  if (parent) {
    parent.remove();
  }
}

/******************************************
 VALIDATE SEATS
******************************************/
function validateSeats(input) {
  if (input.value.length > 3) {
    input.value = input.value.slice(0, 3);
  }
}

/******************************************
 DAY-OF-WEEK -> SCR CODE
******************************************/
function getDayValue(dateObj) {
  const dayValues = {
    Sunday: '0000007',
    Monday: '1000000',
    Tuesday: '0200000',
    Wednesday: '0030000',
    Thursday: '0004000',
    Friday: '0000500',
    Saturday: '0000060'
  };
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dateObj);
  return dayValues[dayName] || '0000000';
}

function formatDateDDMMM(isoDate) {
  if (!isoDate) return '';
  const [yyyy, mm, dd] = isoDate.split('-');
  if (!yyyy || !mm || !dd) return '';
  const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const monthIndex = parseInt(mm,10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return '';
  return dd + monthNames[monthIndex];
}

/******************************************
 IATA SEASON CODE (Syy / Wyy)
******************************************/
function getIataSeasonCode(date = new Date()) {
  const y = date.getFullYear();

  const lastSunday = (year, monthIndex /* 0=Jan..11=Dec */) => {
    const d = new Date(year, monthIndex + 1, 0, 12); // 12:00 on last day of month
    const dow = d.getDay(); // 0=Sun..6=Sat
    d.setDate(d.getDate() - dow); // back to Sunday
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const summerStart = lastSunday(y, 2); // last Sunday of March
  const winterStart = lastSunday(y, 9); // last Sunday of October

  if (date >= winterStart) return "W" + String(y).slice(-2);
  if (date >= summerStart) return "S" + String(y).slice(-2);
  return "W" + String(y - 1).slice(-2);
}

/******************************************
 1) SHOW SCR for NEW/CANCEL
******************************************/
function showSCR(buttonEl) {
  const formDiv = buttonEl.closest('.scr-form');
  if (!formDiv) return;

  const action = formDiv.getAttribute('data-slot-action') || 'NEW';
  const slotType = formDiv.querySelector('.slotType').value;
  const airportCode = (formDiv.querySelector('.airportCode').value || '').toUpperCase();
  const flightNumber = (formDiv.querySelector('.flightNumber').value || '').trim();
  const dateVal = formDiv.querySelector('.dateField').value;
  const seatsVal = formDiv.querySelector('.numberOfSeats').value.padStart(3, '0');
  const acType = (formDiv.querySelector('.aircraftType').value || '').toUpperCase();
  const timeVal = formDiv.querySelector('.timeField').value.padStart(4, '0');
  const destOrig = (formDiv.querySelector('.destinationOrigin').value || '').toUpperCase();
  const serviceType = formDiv.querySelector('.serviceType').value;

  if (!airportCode || !flightNumber || !dateVal || !seatsVal || !acType || !timeVal || !destOrig) {
    alert('Please fill in all fields.');
    return;
  }
  const dateObj = new Date(dateVal);
  if (isNaN(dateObj.getTime())) {
    alert('Invalid date.');
    return;
  }

  const formattedDate = formatDateDDMMM(dateVal);
  const dayValue = getDayValue(dateObj);
  const seasonCode = getIataSeasonCode(dateObj); // NEW

  let indicator = 'N';
  let actionText = 'NEW SLOT';
  if (action === 'CANCEL') {
    indicator = 'D';
    actionText = 'CANCEL SLOT';
  }

  let scrMessage = `SCR  
${seasonCode}  
${formattedDate}  
${airportCode}  
`;
  if (slotType === 'ARRIVAL') {
    scrMessage += `${indicator}${flightNumber} ${formattedDate}${formattedDate} ${dayValue} 000${acType} ${destOrig}${timeVal} ${serviceType}  
SI ${actionText} REQ ${airportCode}`;
  } else {
    scrMessage += `${indicator} ${flightNumber} ${formattedDate}${formattedDate} ${dayValue} 000${acType} ${timeVal}${destOrig} ${serviceType}  
SI ${actionText} REQ ${airportCode}`;
  }

  const outEl = formDiv.querySelector('.scrOutput');
  outEl.textContent = scrMessage.trim();
  outEl.style.display = 'block';

  // Save log entry persistently
  addLogEntry({
    slotAction: actionText,
    scrMessage: scrMessage.trim()
  });
}

/******************************************
 2) EMAIL SCR for NEW/CANCEL
******************************************/
function emailSCR(buttonEl) {
  const formDiv = buttonEl.closest('.scr-form');
  if (!formDiv) return;

  const outputEl = formDiv.querySelector('.scrOutput');
  const scrMsg = outputEl.textContent.trim();
  if (!scrMsg) {
    alert('No SCR message. Please click "Show SCR" first.');
    return;
  }

  const airportCode = (formDiv.querySelector('.airportCode').value || '').toUpperCase();
  const serviceType = formDiv.querySelector('.serviceType').value;

  let emailAddress = '';
  if (serviceType === 'D') {
    emailAddress = airportEmails[airportCode]?.emailGeneral;
    if (!emailAddress) {
      emailAddress = airportEmails[airportCode]?.email;
    }
  } else if (['P', 'J', 'K', 'T'].includes(serviceType)) {
    emailAddress = airportEmails[airportCode]?.email;
  } else {
    emailAddress = airportEmails[airportCode]?.email;
  }
  emailAddress = emailAddress || 'slotdesk@ryanair.com';

  const ccEmail = 'slotdesk@ryanair.com';
  const heading = formDiv.querySelector('h3')?.textContent.toUpperCase() || 'SLOT REQUEST';
  const subject = `${heading} REQ ${airportCode}`;

  const mailtoLink = `mailto:${emailAddress}?cc=${encodeURIComponent(ccEmail)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(scrMsg)}`;
  window.location.href = mailtoLink;
}

/******************************************
 3) SHOW SCR for CHANGE (Old vs New)
******************************************/
function showChangeSCR(buttonEl) {
  const container = buttonEl.closest('.change-scr-container');
  if (!container) return;

  const old_slotType = container.querySelector('.old_slotType').value;
  const old_airport  = (container.querySelector('.old_airport').value || '').toUpperCase();
  const old_flightNo = (container.querySelector('.old_flightNo').value || '').trim();
  const old_date     = container.querySelector('.old_date').value;
  const old_seats    = (container.querySelector('.old_seats').value || '').padStart(3,'0');
  const old_acType   = (container.querySelector('.old_acType').value || '').toUpperCase();
  const old_time     = (container.querySelector('.old_time').value || '').padStart(4,'0');
  const old_do       = (container.querySelector('.old_do').value || '').toUpperCase();
  const old_stc      = container.querySelector('.old_stc').value;

  const new_slotType = container.querySelector('.new_slotType').value;
  const new_airport  = (container.querySelector('.new_airport').value || '').toUpperCase();
  const new_flightNo = (container.querySelector('.new_flightNo').value || '').trim();
  const new_date     = container.querySelector('.new_date').value;
  const new_seats    = (container.querySelector('.new_seats').value || '').padStart(3,'0');
  const new_acType   = (container.querySelector('.new_acType').value || '').toUpperCase();
  const new_time     = (container.querySelector('.new_time').value || '').padStart(4,'0');
  const new_do       = (container.querySelector('.new_do').value || '').toUpperCase();
  const new_stc      = container.querySelector('.new_stc').value;

  if (!old_airport || !old_flightNo || !old_date || !old_acType || !old_time || !old_do ||
      !new_airport || !new_flightNo || !new_date || !new_acType || !new_time || !new_do) {
    alert('Please fill in all Old Request and New Request fields.');
    return;
  }

  const old_ddmmm = formatDateDDMMM(old_date);
  const new_ddmmm = formatDateDDMMM(new_date);
  const old_dayVal = getDayValue(new Date(old_date));
  const new_dayVal = getDayValue(new Date(new_date));
  const seasonCode = getIataSeasonCode(new Date(old_date)); // NEW (header season based on old_date)

  const old_indicator = (old_slotType === 'Arrival') ? `C${old_flightNo}` : `C ${old_flightNo}`;
  const new_indicator = (new_slotType === 'Arrival') ? `R${new_flightNo}` : `R ${new_flightNo}`;

  let old_stationTime = (old_slotType === 'Arrival') ? `${old_do}${old_time}` : `${old_time}${old_do}`;
  let new_stationTime = (new_slotType === 'Arrival') ? `${new_do}${new_time}` : `${new_time}${new_do}`;

  let scrMessage = `SCR
${seasonCode}
${old_ddmmm}
${old_airport}
${old_indicator} ${old_ddmmm}${old_ddmmm} ${old_dayVal} 000${old_acType} ${old_stationTime} ${old_stc}  
${new_indicator} ${new_ddmmm}${new_ddmmm} ${new_dayVal} 000${new_acType} ${new_stationTime} ${new_stc}

SI SLOT CHG REQ ${old_airport}`;

  const outEl = container.querySelector('.change-scrOutput');
  outEl.textContent = scrMessage.trim();
  outEl.style.display = 'block';

  // Save log entry persistently
  addLogEntry({
    slotAction: 'SCR CHANGE',
    scrMessage: scrMessage.trim()
  });
}

/******************************************
 4) EMAIL SCR for CHANGE
******************************************/
function emailChangeSCR(buttonEl) {
  const container = buttonEl.closest('.change-scr-container');
  if (!container) return;
  const outEl = container.querySelector('.change-scrOutput');
  const scrMsg = outEl.textContent.trim();
  if (!scrMsg) {
    alert('No SCR message. Please click "Show SCR" first.');
    return;
  }

  const old_airport = (container.querySelector('.old_airport').value || '').toUpperCase();
  const serviceType = container.querySelector('.old_stc').value;
  const airportCode = old_airport || '???';

  let emailAddress = '';
  if (serviceType === 'D') {
    emailAddress = airportEmails[airportCode]?.emailGeneral;
    if (!emailAddress) {
      emailAddress = airportEmails[airportCode]?.email;
    }
  } else if (['P', 'J', 'K', 'T'].includes(serviceType)) {
    emailAddress = airportEmails[airportCode]?.email;
  } else {
    emailAddress = airportEmails[airportCode]?.email;
  }
  emailAddress = emailAddress || 'slotdesk@ryanair.com';

  const ccEmail = 'slotdesk@ryanair.com';
  const subject = `CHANGE SCR REQ ${airportCode}`;

  const mailtoLink = `mailto:${emailAddress}?cc=${encodeURIComponent(ccEmail)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(scrMsg)}`;
  window.location.href = mailtoLink;
}

/******************************************
 SHOW LOG
******************************************/
function showLog() {
  const logData = getHistoricLog();
  const logContainer = document.getElementById('logContainer');
  const logTableBody = document.querySelector('#logTable tbody');
  logTableBody.innerHTML = '';

  if (logData.length === 0) {
    logContainer.style.display = 'none';
    alert('No log data available.');
    return;
  }

  logData.forEach(item => {
    const row = logTableBody.insertRow();
    const cellAction = row.insertCell(0);
    const cellMessage = row.insertCell(1);
    cellAction.textContent = item.slotAction;
    cellMessage.textContent = item.scrMessage;
  });

  logContainer.style.display = 'block';
  logContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/******************************************
 DOWNLOAD CSV
******************************************/
function downloadCSV() {
  const logData = getHistoricLog();
  if (logData.length === 0) {
    alert('No log data available to download.');
    return;
  }

  const csvRows = [
    ['Slot Action', 'SCR Message'],
    ...logData.map(item => [item.slotAction, item.scrMessage.replace(/\n/g, ' ')])
  ];

  const csvContent = csvRows.map(row => row.map(field => `"${field.replace(/"/g, '""')}"`).join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'scr_log.csv');
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
