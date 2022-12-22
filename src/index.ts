import puppeteer, { ElementHandle, Page } from "puppeteer";
import * as chrono from "chrono-node";
import yargs from "yargs";

// TODO: Somehow get dumbass typescript to figure out how to use typeof argv.
type Options = {
  domain: string;
  email: string;
  password: string;
};

const argv = yargs
  .option("domain", {
    description: "Amazon domain to use eg. amazon.com",
    alias: "d",
    type: "string",
  })
  .option("email", {
    description: "Email address to login as",
    alias: "e",
    type: "string",
    require: true,
  })
  .option("password", {
    description: "Password to use when logging in",
    alias: "p",
    type: "string",
    require: true,
  })
  .help()
  .alias("help", "h").argv;

type Result = {
  date?: string;
  amount?: string;
  id?: string;
  title?: string;
  deliveryText?: string;
  delivery?: Date;
};

const signIn = async (options: Options, page: Page, signInLink: any) => {
  await signInLink.click();

  const inputEmail = await page.waitForSelector("#ap_email");
  await inputEmail?.type(options.email);

  const buttonContinue = await page.waitForSelector("#continue");
  buttonContinue?.click();

  const inputPassword = await page.waitForSelector("#ap_password");
  await inputPassword?.type(options.password);

  const inputRememberMe = await page.waitForSelector("input[name=rememberMe]");
  await inputRememberMe?.click();

  const buttonSignin = await page.waitForSelector("#signInSubmit");
  await buttonSignin?.click();
};

const parseCards = async (orderCards: ElementHandle[]) => {
  // TODO: Missing some items? Getting 7 at times.
  return Promise.all(
    orderCards.map(async (oc, index) => {
      const values = await oc.$$(".a-color-secondary");
      const obj: Result = {};
      const [, date, , amount, , , id] = await Promise.all(
        values.map(async (value) => await value.evaluate((el) => el.innerText))
      );
      obj.date = date;
      obj.amount = amount;
      obj.id = id;
      obj.deliveryText = await (
        await oc.$(
          ".a-size-medium.a-color-base.a-text-bold,.yohtmlc-shipment-status-primaryText"
        )
      )?.evaluate((el) => el.innerText);
      obj.delivery = chrono.parseDate(obj.deliveryText || "");
      obj.title = await (
        await oc.$(".yohtmlc-product-title,.yohtmlc-item a")
      )?.evaluate((el) => el.innerText);

      return obj;
    })
  );
};

const getOrders = async (options: Options) => {
  const browser = await puppeteer.launch({ userDataDir: "./persist" });
  const page = await browser.newPage();

  try {
    const url = `https://${options.domain || "amazon.com"}`;

    await page.goto(url);

    await page.waitForSelector("#nav-cart");

    const signInLink = await page.$("#nav-link-accountList");
    const canSignIn = await signInLink?.evaluate((el) => {
      return el.innerText.match(/sign in/i) !== null;
    });

    if (canSignIn) {
      console.debug("Not logged in, signing in");
      await signIn(options, page, signInLink);
    }

    const ordersButton = await page.waitForSelector("#nav-orders");
    await ordersButton?.click();

    await page.waitForNavigation();

    const cards = await page.$$(".order-card");

    // browser.close();

    return parseCards(cards).then((cards) => {
      browser.close();
      return cards;
    });
  } catch (e) {
    await page.screenshot({ path: "error.png" });
    console.error(e);
  }
};

(async () => {
  console.log(JSON.stringify(await getOrders(argv as Options)));
})();
