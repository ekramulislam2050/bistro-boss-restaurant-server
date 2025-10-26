// mailgun setup-----------
const FormData = require("form-data");
const Mailgun = require("mailgun.js");
// mailgun instance---------
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
    username: "api",
    key: process.env.MAIL_GUN_API_KEY || "API_KEY",

});

 const mailgunConfirmation = async (payment) => {
    try {
        await mg.messages.create(process.env.MAIL_GUN_SENDING_DOMAIN, {
            from: "Mailgun Sandbox <postmaster@sandboxa06e3762761d42aea0b10f1ddca9e592.mailgun.org>",
            to: ["ekramulislam2050@gmail.com"],
            subject: "Bistro boss order confirmation",
            text: "Congratulations Ekramul, you just sent an email with Mailgun! You are truly awesome!",
            html: `hey,ekramul here is your transaction ID = ${payment.transaction}`
        });
    } catch (error) {
        console.log("❌ Failed to send confirmation email:", error)
    }
}

module.exports={mailgunConfirmation}