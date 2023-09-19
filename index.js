const express=require("express")
const {openDb}=require("./database")
const crypt=require("bcrypt")
const app=express()

const sessions={}

app.use(express.json())



app.get("/",(req,res)=>{
    res.send("<html><p>hello</p></html>")

})
app.post("/signup",async(req,res)=>{
    //console.log(req.body)
    
    let data=req.body
    const db=await openDb()
    const result=await db.run('INSERT into user (name,username,password) Values(:name,:username,:password)',{
    ':name': data.name,
    ':username':data.username,
    ':password':crypt.hash(data.password,1)})

    console.log(result)
    res.send({message:"ok"})
})


app.post("/signin",async(req,res)=>{
    let data=req.body
    const db=await openDb()
    const result=await db.get('select * from user where name=:name',{
        ":name":data.name
    })
    
    if(crypt.compare(data.password,result.password)){
        res.send({message:"ok"})
    }
    res.send({message:"k"})
})


app.listen(8000,()=>{
    console.log("listening to http://localhost:8000")
})