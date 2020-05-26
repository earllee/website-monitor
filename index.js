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

const monitor = async () => {
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ]});

  const checkPage = async (website) => {
    const name = website.name;
    const url = website.url;
    const selector = website.selector;
    const textToMatch = website.text;

    try {
      // TODO: Gracefully handle page crash
      const page = await browser.newPage();

      // TODO: Gracefully handle page crash
      await page.goto(url)

      // TODO: Gracefully handle failed selector
      const target = await page.$(selector);
      const targetText = target ? await (await target.getProperty('innerHTML')).jsonValue() : null;

      page.close();

      if (targetText === null) {
        console.log(`[${dayjs().format('MMM D h:mma')}] ${name}\n  -> Parsing error.`);
      } else if (textToMatch !== targetText) {
        console.log(`[${dayjs().format('MMM D h:mma')}] ${name}\n  -> Out of stock.`);
      } else {
        console.log(`[${dayjs().format('MMM D h:mma')}] ${name}\n  -> In stock! Buy at ${url}.`);

        const msg = {
          to: toEmail,
          from: fromEmail,
          subject: `In-Stock: ${name}`,
          text: 'url',
          html: `<a href=${url}><strong>Click here to buy!</strong></a>`,
        };

        sgMail.send(msg).catch(function (e) { console.log(e.response.body.errors) });

        const txt = {
          body: `In-Stock: ${name}, ${url}`,
          from: process.env.FROM_PHONE,
          to: process.env.TO_PHONE
        };

        twilio.messages.create(txt).catch(e => { console.log(e) });

        arrayRemove(websites, (website) => website.url === url);
      }
    } catch (e) {
        if (page) page.close();
        console.log(`[${dayjs().format('MMM D h:mma')}] ${name}\n  -> Error: ${e}`);

    }

  };

  websites.forEach(async function (website) {
    await checkPage(website);
  });

  setInterval(function () {
    websites.forEach(async function (website) {
      await checkPage(website);
    });

    console.log();
  }, checkInterval);

};

monitor();
