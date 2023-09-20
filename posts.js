const express = require("express");
const { openDb } = require("./database");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const session = require("express-session");

const router = express.Router();
router.use(express.json());

router.get("/about", (req, res) => {
  res.send("hello");
});

module.exports = { router };
