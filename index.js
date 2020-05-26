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
  const browser = await puppeteer.launch();

  const checkPage = async (website) => {
    const name = website.name;
    const url = website.url;
    const selector = website.selector;
    const textToMatch = website.text;

    const page = await browser.newPage();
    await page.goto(url);

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

      arrayRemove(websites, (website) => website.url === url);
    }

  };

  websites.forEach(function (website) {
    checkPage(website);
  });

  setInterval(function () {
    websites.forEach(function (website) {
      checkPage(website);
    });

    console.log();
  }, checkInterval);

};

monitor();
