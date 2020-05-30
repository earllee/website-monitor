require('dotenv').config();
const fs = require('fs');
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const arrayRemove = require('lodash/remove');
const csv = require('csv-parser');

// SendGrid config
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const toEmail = process.env.TO_EMAIL;
const fromEmail = process.env.FROM_EMAIL;

// Twilio config
const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Time config
const minutes = 1;
const msInMinute = 60000;
const checkInterval = minutes * msInMinute;

// Read list of websites
const websites = [];
fs.createReadStream('websites.csv')
  .pipe(csv())
  .on('data', (data) => websites.push(data))
  .on ('end', () => {
    console.log(websites);
  });

const logItem = (item, msg) => console.log(`[${dayjs().format('MMM D h:mma')}] ${item}\n  -> ${msg}`);

const monitor = async () => {
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--disable-crash-reporter'
    ], headless: true });

  const checkPage = async (website) => {
    const name = website.name;
    const url = website.url;
    const selector = website.selector;
    const textToMatch = website.text;

    const page = await browser.newPage().catch(e => logItem(name, e));

    await page.goto(url).catch(async e => {
      await page.close();
      logItem(name, e);
    });

    if (page.isClosed())
      return;

    const target = await page.$(selector);
    const targetText = target ? await (await target.getProperty('textContent')).jsonValue() : null;

    page.close();

    if (targetText === null) {
      logItem(name, 'ERROR: Failed to parse text.');
    } else if (textToMatch !== targetText) {
      logItem(name, 'Out of stock.');
    } else {
      logItem(name, `In stock! Buy at ${url}.`);

      const msg = {
        to: toEmail,
        from: fromEmail,
        subject: `In-Stock: ${name}`,
        text: 'url',
        html: `<a href=${url}><strong>Click here to buy!</strong></a>`,
      };

      sgMail.send(msg).catch(e => {
        logItem(name, `ERROR: ${e.response.body.error}`);
      });

      const txt = {
        body: `In-Stock: ${name}, ${url}`,
        from: process.env.FROM_PHONE,
        to: process.env.TO_PHONE
      };

      twilio.messages.create(txt).catch(e => { console.log(e) });

      arrayRemove(websites, (website) => website.url === url);
    }

  };

  websites.forEach(async function (website) {
    await checkPage(website);
  });

  setInterval(function () {
    websites.forEach(async function (website) {
      await checkPage(website);
    });

  }, checkInterval);

};

monitor();
