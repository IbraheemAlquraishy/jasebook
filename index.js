const express = require("express");
const { openDb } = require("./database");
const crypt = require("bcrypt");
const app = express();
const passport = require("passport");
const cookieParser = require("cookie-parser");
const LocalStrategy = require("passport-local");
const session = require("express-session");
const fs=require("fs")
const path=require("path")
const multer=require("multer")
const { validateMIMEType } =require("validate-image-type")

const storage=multer.diskStorage({
  destination:(req,file,cb)=>{
    cb(null,'public/imgs')
  },filename:async(req,file,cb)=>{
    if(req.user){
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      const db=await openDb()
      await db.run("update user set img=:url where id=:id",{
        ":url":file.fieldname+'-'+uniqueSuffix+file.mimetype.replace('/','.'),
        ":id":req.user.id
      })
      cb(null, file.fieldname + '-' + uniqueSuffix+file.mimetype.replace('/','.'))
    }else{
      cb("no such user")
    }
  }
})

const upload=multer({storage:storage})

const SQLiteStore = require("connect-sqlite3")(session);

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({ db: "sessions.db", dir: "./tmp" }),
  })
);
app.use(passport.authenticate("session"));
app.use(function (req, res, next) {
  var msgs = req.session.messages || [];
  res.locals.messages = msgs;
  res.locals.hasMessages = !!msgs.length;
  req.session.messages = [];
  next();
});



//custom functions





//passport functions
passport.use(
  new LocalStrategy({ usernameField: "name" }, async function verify(
    name,
    password,
    cb
  ) {
    console.log("start db for login");
    const db = await openDb();
    const user = await db.get("select * from user where name=:name", {
      ":name": name,
    });
    console.log(user);
    if (user == undefined) {
      console.log("no such user");
      return cb(null, false, { message: "incorrect name or password" });
    }
    const match = crypt.compareSync(password, user.password);
    if (match) {
      return cb(null, user);
    } else {
      console.log("password is wrong");
      return cb(null, false, { message: "incorrect name or password" });
    }
  })
);

passport.serializeUser(function (user, cb) {
  cb(null, { id: user.id, name: user.name, username: user.username ,img:user.img});
});

passport.deserializeUser(function (user, cb) {
  return cb(null, user);
});

//routes
app.get("/", (req, res) => {
  res.send("<html><p>hello</p></html>");
});

app.post("/signup", async (req, res, next) => {
  let data = req.body;

  const db = await openDb();

  try {
    result = await db.run(
      "INSERT into user (name,username,password,img) Values(:name,:username,:password,default.png)",
      {
        ":name": data.name,
        ":username": data.username,
        ":password": crypt.hashSync(data.password, 10),
      }
    );
    result = await db.get("select * from user where name=:name", {
      ":name": data.name,
    });
    const user = {
      id: result.id,
      name: data.name,
      username: data.username,
    };
    req.login(user, function (err) {
      if (err) {
        return next(err);
      }
      console.log("hey");
      res.send({ message: "welcome" });
    });
  } catch (err) {
    console.log(err);
    res.send({ message: "user already taken" });
  }
});

app.post(
  "/signin",
  passport.authenticate("local", {
    successMessage: { message: "signed in" },
    failureMessage: true,
  }),
  function (req, res) {
    res.send({ message: "welcome" });
  }
);

app.get("/me", (req, res) => {
  if (req.user) {
    res.send({ name: req.user.name, username: req.user.username,img: req.user.img });
  } else {
    res.statusCode = 401;
    res.send({ message: "you are not signed in" });
  }
});


app.post("/me/img",upload.single('img'),async(req,res)=>{
  if(req.user){
    const result = await validateMIMEType("./public/imgs/"+req.file.filename, {
      allowMimeTypes: ['image/jpeg', 'image/gif', 'image/png']
    });
    if (!result.ok) {
      fs.unlinkSync(path.join(__dirname+"/public/imgs/"+req.file.filename))
      req.user.img="default.png"
      const db=await openDb()
      await db.run("update user set img='default.png' where id=:id",{
        ":id":req.user.id
      })
      res.send({message:"file type is not accepted"})
    }else{
      res.send({message:"done"})
    }
  }
})


app.get("/img/:name",(req,res)=>{
  try{
    res.sendFile(path.join(__dirname+"/public/imgs/"+req.params.name))
  }catch(err){
    console.log(err)
    res.send({message:"no such file"})
  }
})


app.delete("/me/img",async(req,res)=>{
  if(req.user){
    const db=await openDb()
    const data=await db.get("select img from user where id=:id",{
      ":id":req.user.id
    })
    if(data.img=="default.png"){
      res.statusCode=403
      res.send({message:"you dont have img to remove"})
    }else{
      fs.unlinkSync(path.join(__dirname+"/public/imgs/"+data.img))
      req.user.img="default.png"
      await db.run("update user set img='default.png' where id=:id",{
        ":id":req.user.id
      })
      res.send({message:"done"})
    }
  }else{
    res.statusCode = 401;
    res.send({ message: "you are not signed in" });
  }
})

app.delete("/me", async (req, res) => {
  if (req.user) {
    const db = await openDb();
    const deid = req.user.id;
    const dename = req.user.name;
    const resault = await db.get("SELECT id FROM user WHERE id =:id", {
      ":id": deid,
    });

    if (resault == undefined) {
      res.send({ message: "This user does not exist!" });
    } else {
      await db.run("DELETE FROM user WHERE id =:id", {
        ":id": resault,
      });
      console.log("the user has been removed");
      res.send({ message: `The following user: ${dename} has been removed!` });
    }
  }
});

app.post("/logout", function (req, res, next) {
  if (req.user == undefined) {
    res.send({ message: "you are not signed in" });
  } else {
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.send({ message: "loged out" });
    });
  }
});

//post handlers
app.get("/myposts", async (req, res) => {
  if (req.user) {
    const db = await openDb();
    try {
      const data = await db.all("select id,body,date from post where posterid=:id", {
        ":id": req.user.id,
      });
      
      res.send(data);
    } catch (e) {
      res.send({ message: "you dont have posts" });
    }
  } else {
    res.send({ message: "you are not signed in" });
  }
});

app.post("/post",async (req,res) => {
  if(req.user){
    const data=req.body
    const db=await openDb()
    let date=new Date(Date.now())
    try{
      await db.run("INSERT INTO post (body,date,posterid) values (:body,:date,:posterid)",{
        ":body":data.body,
        ":date":date.toISOString(),
        ":posterid":req.user.id
      })
      res.send({message:"done"})
    }catch(err){
      console.log(err)
      res.statusCode=500
      res.send({message:"something wrong happend"})
    }
  }else{
    res.status(401)
    res.send({message:"you are not signed in"})
  }
})


app.get("/user/:name/posts",async(req,res)=>{
  const name=req.params.name
  const db=await openDb()
  const user=await db.get("select id from user where name=:name",{
    ":name":name
  })
  console.log(user)
  if(user==undefined){
    res.statusCode=404
    res.send({message:"user does not exist"})
  }else{
    try{
      const result=await db.all("select id,body,date from post where posterid=:posterid",{
        ":posterid":user.id
      })
      res.send(result)
    }catch(err){
      console.log(err)
      res.statusCode=500
      res.send({message:"something went wrong"})
    }
  }
})

app.get('/post/:id',async(req,res)=>{
  const id=req.params.id
  const db=await openDb()
  try{
  const result=await db.get("select * from post where id=:id",{
    ":id":id
  })
  
  const user=await db.get("select name from user where id=:id",{
    ":id":result.posterid
  })
  res.send({id:result.id,body:result.body,data:result.data,poster:user.name})
  }catch(err){
  console.log(err)
  res.statusCode=500
  res.send({message:"something went wrong"})
  }
})


app.put("/post/:id",async (req,res)=>{
  const id=req.params.id
  const db=await openDb()
  const result=await db.get("select * from post where id=:id",{
    ":id":id
  })
  
  if(req.user==undefined){
    res.statusCode=401
    res.send({message:"you are not signed in"})
  }
  else if(req.user.id==result.posterid){
    try{
      await db.run("update post set body=:body where id=:id",{
        ":body":req.body.body,
        ":id":id
      })
      res.send({message:"done"})
    }catch(err){
      console.log(err)
      res.statusCode=500
      res.send({message:"something went wrong"})
    }
  }else{
    res.statusCode=401
    res.send({message:"you dont have permission"})
  }
})

app.delete("/post/:id",async (req,res)=>{
  const id=req.params.id
  const db=await openDb()
  const result=await db.get("select * from post where id=:id",{
    ":id":id
  })
  if(req.user==undefined){
    res.statusCode=401
    res.send({message:"you are not signed in"})
  }else if(result==undefined){
    res.statusCode=404
    res.send({message:"no such post"})
  }
  
  else if(req.user.id==result.posterid){
    try{
      await db.run("delete from post  where id=:id",{
        ":id":id
      })
      res.send({message:"done"})
    }catch(err){
      console.log(err)
      res.statusCode=500
      res.send({message:"something went wrong"})
    }
  }else{
    res.statusCode=401
    res.send({message:"you dont have permission"})
  }
})
//likes: add like - remove like - get liked posts by user - get users who likes by post - number of the likes on post

app.listen(8000, () => {
  console.log("listening to http://localhost:8000");
});
