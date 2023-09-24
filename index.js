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
const {noty,getnoty,denoty}=require("./notification")
const {feed}=require("./feed")


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
      "INSERT into user (name,username,password,img) Values(:name,:username,:password,'default.png')",
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
app.get("/me/post", async (req, res) => {
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
      const id=await db.get("INSERT INTO post (body,date,posterid) values (:body,:date,:posterid);select id from post where body=:body and date=:date and posterid=:posterid",{
        ":body":data.body,
        ":date":date.toISOString(),
        ":posterid":req.user.id
      })
      const friends=await db.all("select * from friend where user1=:id and accepted=1 or user2=:id and accepted=1",{
        ":id":req.user.id
      })
      console.log(friends)
      for(let i=0;i<friends.length;i++){
        if(friends[i].user1==req.user.id){
          await noty(friends[i].user2,req.user.id,1,id)
        }else{
          await noty(friends[i].user1,req.user.id,1,id)
        }
      }
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


app.get("/user/:name",async(req,res)=>{
  const name=req.params.name
  const db=await openDb()
  const user=await db.get("select * from user where name=:name",{
    ":name":name
  })
  console.log(user)
  if(user==undefined){
    res.statusCode=404
    res.send({message:"user does not exist"})
  }else{
    res.send({name:user.name,username:user.username,img:user.img})
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



app.post("/post/:id/like", async (req,res)=> {
const db = await openDb()
if(req.user){
  
  const resault = await db.get("select * from like where userid=:userid and postid=:postid",{":userid" :req.user.id, ":postid": req.params.id})
 if(resault==undefined){
  try{
    await db.run("INSERT INTO LIKE (userid,postid) values (:userid, :postid)", {":userid" :req.user.id, ":postid": req.params.id})
    const user=await db.get("select posterid from post where id=:postid",{":postid":req.params.id})
    await noty(user.posterid,req.user.id,3,req.params.id)
    res.send({message: "Done"})
  }
 catch(err){
  console.log(err)
  res.statusCode=500
  res.send({message:"something went wrong"})
 }
 }else{
  try{
    await db.run("delete from like where userid=:userid and postid=:postid",{":userid" :req.user.id, ":postid": req.params.id})
    res.send({message: "Done"})
  }
 catch(err){
  console.log(err)
  res.statusCode=500
  res.send({message:"something went wrong"})
 }
 }
}else{
  res.statusCode=401
  res.send({message:"you dont have permission"})
}
})


app.get("/user/:name/likes",async(req,res)=>{
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
      const result = await db.all("SELECT postid FROM LIKE WHERE userid=:userid",{
        ":userid":user.id
      })
      
      const postarray = []
      for(let i =0; i<result.length;i++){
        console.log(result[i])
    const r = await db.get("SELECT * FROM POST WHERE id=:id", {":id": result[i].postid})
    postarray.push(r)
      }
      res.send(postarray)
    }catch(err){
      console.log(err)
      res.statusCode=500
      res.send({message:"something went wrong"})
    }
  }
})


app.get("/post/:id/likes",async(req,res)=>{
  const id=req.params.id
  const db=await openDb()
  const post=await db.get("select id from post where id=:id",{
    ":id":id
  })
  console.log(post)
  if(post==undefined){
    res.statusCode=404
    res.send({message:"post does not exist"})
  }else{
    try{
      const result = await db.all("SELECT userid FROM LIKE WHERE postid=:postid",{
        ":postid":post.id
      })
      const userarray = []
      for(let i =0; i<result.length;i++){
    const r = await db.get("SELECT username FROM user WHERE id=:id", {":id": result[i].userid})
    userarray.push(r)
      }
      res.send(userarray)
    }catch(err){
      console.log(err)
      res.statusCode=500
      res.send({message:"something went wrong"})
    }
  }
})

app.get("/post/:id/likes/count",async(req,res)=>{
  const id=req.params.id
  const db=await openDb()
  const post=await db.get("select id from post where id=:id",{
    ":id":id
  })
  console.log(post)
  if(post==undefined){
    res.statusCode=404
    res.send({message:"post does not exist"})
  }else{
    try{
      const result = await db.all("SELECT userid FROM LIKE WHERE postid=:postid",{
        ":postid":post.id
      })
      res.send({count: result.length})
    }catch(err){
      console.log(err)
      res.statusCode=500
      res.send({message:"something went wrong"})
    }
  }
})

//friends routes
app.post("/user/:name/friend",async(req,res)=>{
  if(req.user){
    const db=await openDb()
    const friend=await db.get("select id from user where name=:name",{
      ":name":req.params.name
    })
    console.log(friend)
    if(friend==undefined){
      res.statusCode=404
      res.send({message:"no such user"})
    }else{
      const x=await db.get("select * from friend where user1=:me and user2=:id",{
        ":id":friend.id,
        ":me":req.user.id
      })
      console.log(x)
      if(x==undefined){
      await db.run("insert into friend(user1,user2,accepted) values(:user,:friend,0)",{
        ":user":req.user.id,
        ":friend":friend.id
      })
      await noty(friend.id,req.user.id,4)
      res.send({message:"friend request has been send"})
    }else{
      if(x.accepted==1){
        res.send({message:"you are friends"})
      }else{
        res.send({message:"already a request has been send"})
      }
    }
    }
  }else{
    res.statusCode=401
    res.send({message:"you are not signed in"})
  }
})


app.get("/me/request",async(req,res)=>{
  if(req.user){
    const db=await openDb()
    const result=await db.all("select id,user1 from friend where user2=:user and accepted=0",{
      ":user":req.user.id
    })
    if(result==undefined){
      res.send({message:"you dont have new friend requests"})
    }else{
      const r=[]
      for(let i=0;i<result.length;i++){
        const x=await db.get("select name from user where id=:id",{":id":result[i].user1})
        r.push({id:result[i].id,name:x.name})
      }
      res.send(r)
    }
  }else{
    res.statusCode=401
    res.send({message:"you are not signed in"})
  }
})


app.post("/me/request/:id",async(req,res)=>{
  if(req.user){
    const db=await openDb()
    const request=await db.get("select * from friend where id=:id",{
      ":id":req.params.id
    })
    if(req.user.id==request.user2){
      if(request.accepted==0){
        if(req.body.accept==1){
        await db.run("update friend set accepted=1 where id=:id",{
          ":id":req.params.id
        })}
        else{
          await db.run("delete from friend where id=:id",{
            ":id":req.params.id
          })
        }
        res.send({message:"done"})
      }else{
        res.send({message:"already accepted"})
      }
    }else{
      res.statusCode=401
      res.send({message:"you dont have permission"})
    }
  }else{
    res.statusCode=401
    res.send({message:"you are not signed in"})
  }
})


app.get("/me/friend",async(req,res)=>{
  if(req.user){
    const db=await openDb()
    const friends=await db.all("select * from friend where user1=:id or user2=:id",{
      ":id":req.user.id
    })
    const r=[]
    for(let i=0;i<friends.length;i++){
      let j
      if(friends[i].user1==req.user.id){
        const x=await db.get("select name from user where id=:id",{
          ":id":friends[i].user2
        })
        if(friends[i].accepted==0){
          j={name:x.name,stat:"waiting to accept"}
        }else{
          j={name:x.name,stat:"friends"}
        }
      }else{
        const x=await db.get("select name from user where id=:id",{
          ":id":friends[i].user1
        })
        if(friends[i].accepted==1){
          j={name:x.name,stat:"friends"}
        }
      }
      r.push(j)
    }
    res.send(r)
  }else{
    res.statusCode=401
    res.send({message:"you are not signed in"})
  }
})

app.get("/user/:name/friend",async(req,res)=>{
  
    const db=await openDb()
    const user=await db.get("select id from user where name=:name",{
      ":name":req.params.name
    })
    if(user==undefined){
      res.statusCode=404
      res.send({message:"no such user"})
    }else{
    const friends=await db.all("select * from friend where user1=:id and accepted=1 or user2=:id and accepted=1",{
      ":id":user.id
    })
    const r=[]
    for(let i=0;i<friends.length;i++){
      let j
      if(friends[i].user1==user.id){
        const x=await db.get("select name from user where id=:id",{
          ":id":friends[i].user2
        })
        
        j={name:x.name}
        
      }else{
        const x=await db.get("select name from user where id=:id",{
          ":id":friends[i].user1
        })
        if(friends[i].accepted==1){
          j={name:x.name}
        }
      }
      r.push(j)
    }
    res.send(r)
  }
})


app.delete("/me/friend/:name",async(req,res)=>{
  if(req.user){
    const db=await openDb()
    const friend=await db.get("select id from user where name=:name",{
      ":name":req.params.name
    })
    if(friend==undefined){
      res.statusCode=404
      res.send({message:"no such user"})
    }else{
      const x=await db.get("select id from friend where user1=:id and user2=:me or user1=:me and user2=:id",{
        ":id":friend.id,
        ":me":req.user.id
      })
      if(x==undefined){
        res.statusCode=404
        res.send({message:"you are not friends"})
      }else{
        await db.run("delete from friend where id=:id",{
          ":id":x.id
        })
        res.send({message:"done"})
      }
    }
  }else{
    res.statusCode=401
    res.send({message:"you are not signed in"})
  }
})

//add - comment
app.get("/post/:id/comment", async (req, res) => {
  const db = await openDb();
  
  
  const result = await db.all(
    "select * from comment where postid=:postid",
  {  ":postid": req.params.id });
  if (result == undefined) {
    res.send({ message: "there are no comments" });
  } else {
    const r=[]
    let j
    for(let i=0;i<result.length;i++){
      const x=await db.get("select name from user where id=:id",{
        ":id":result[i].commenterid
      })

      j={id:result[i].id,commenter:x.name,postid:result[i].postid,body:result[i].body,date:result[i].date}
      r.push(j)
    }

      res.send(r);
  }
  
});


app.post("/post/:id/comment", async (req, res) => {
  const db = await openDb();
  const comm = req.body.body;
  if (req.user) {
    try {
      await db.run(
        "INSERT INTO comment (commenterid,postid,body,date) values (:userid, :postid,:body, :date)",
        {
          ":userid": req.user.id,
          ":postid": req.params.id,
          ":body":comm,
          ":date":new Date(Date.now()).toISOString()
        }
      );
      const user=await db.get("select posterid from post where id=:postid",{":postid":req.params.id})
      await noty(user.posterid,req.user.id,2,req.params.id)
      res.send({ message: "Done" });
    } catch (err) {
      console.log(err);
      res.statusCode = 500;
      res.send({ message: "something went wrong" });
    }
  } else {
    res.statusCode = 401;
    res.send({ message: "you dont have permission" });
  }
});

//delete comment

app.delete("/post/:id/comment/:commid", async (req, res) => {
  const db = await openDb();
  const postid = req.params.id;
  const commid=req.params.commid
  if (req.user) {
    const result = await db.get(
      "select * from comment where commenterid=:userid and postid=:postid and id=:commid",
      { ":userid": req.user.id, ":postid": postid, ":commid": commid }
    );
    if (result == undefined) {
      res.send({ message: "This comment does not exist" });
    } else {
      try {
        await db.run("delete from comment where id=:commid", {
          ":commid": commid,
        });
        res.send({ message: "done" });
      } catch (err) {
        console.log(err);
        res.statusCode = 500;
        res.send({ message: "something went wrong" });
      }
    }
  } else {
    res.statusCode = 401;
    res.send({ message: "you dont have permission" });
  }
});

//edit comment

app.put("/post/:id/comment/:commid", async (req, res) => {
  const db = await openDb();
  const comm = req.body.body;
  const postid = req.params.id;
  const commid=req.params.commid
  if (req.user) {
    const result = await db.get(
      "select * from comment where commenterid=:userid and postid=:postid and id=:commid",
      { ":userid": req.user.id, ":postid": postid, ":commid": commid }
    );
    if (result == undefined) {
      res.send({ message: "This comment does not exist" });
    } else {
      try {
        await db.run("UPDATE comment SET body =:comm WHERE id=:commid", {
          ":comm": comm,
          ":commid": commid,
        });
        res.send({ message: "Done" });
      } catch (err) {
        console.log(err);
        res.statusCode = 500;
        res.send({ message: "something went wrong" });
      }
    }
  } else {
    res.statusCode = 401;
    res.send({ message: "you dont have permission" });
  }
});

//number of comments

app.get("/post/:id/comment/count", async (req, res) => {
  const id = req.params.id;
  const db = await openDb();
  const post = await db.get("select id from post where id=:id", {
    ":id": id,
  });
  console.log(post);
  if (post == undefined) {
    res.statusCode = 404;
    res.send({ message: "post does not exist" });
  } else {
    try {
      const result = await db.all(
        "SELECT id FROM comment WHERE postid=:postid",
        {
          ":postid": post.id,
        }
      );
      res.send({ count: result.length });
    } catch (err) {
      console.log(err);
      res.statusCode = 500;
      res.send({ message: "something went wrong" });
    }
  }
});


//notification
app.get("/me/notifiaction",async(req,res)=>{
  if(req.user){
    const r=await getnoty(req.user)
    res.send(r)
  }else {
    res.statusCode = 401;
    res.send({ message: "you dont have permission" });
  }

})

app.delete("/me/notifiaction/:id",async(req,res)=>{
  if(req.user){
    const db=await openDb()
    const d=await db.get("select recyid from noty where id=:id",{
      ":id":req.params.id
    })
    if(d==undefined){
      res.statusCode=404
      res.send({message:"no such notification"})
    }else{
    if(d.recyid==req.user.id){
      await denoty(req.params.id)
      res.send({message:"done"})
    }else {
      res.statusCode = 401;
      res.send({ message: "you dont have permission" });
    }
  }
  }else {
    res.statusCode = 401;
    res.send({ message: "you dont have permission" });
  }
})



//feed
app.get("/post",async(req,res)=>{
  if(req.user){
    const list=await feed(req.user.id)
    res.send(list)
  }else{
    const list=await feed()
    return list
  }
})




app.listen(8000, () => {
  console.log("listening to http://localhost:8000");
});
