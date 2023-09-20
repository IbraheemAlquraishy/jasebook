const express = require("express");
const { openDb } = require("./database");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const session = require("express-session");

const postrouter = express.Router();
postrouter.use(express.json());

postrouter.get("/about", (req, res) => {
  res.send("hello");
});

module.exports = { postrouter };
