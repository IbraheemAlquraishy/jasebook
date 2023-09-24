const { compareSync } = require("bcrypt")
const {openDb}=require("./database")


function ifexistinlist(search,indexlist){
    for(let i=0;i<indexlist.length;i++){
        if(search==indexlist[i]){
            return true
        }
    }
    return false
}

const pos=[]
let numberofguest=0
async function feed(userid){
    const db=await openDb()
    if(userid!=undefined){
    const list=await db.all("select * from post where posterid !=:userid order by id desc limit 100",{":userid":userid})
    const friends1=await db.all("select user1 from friend where user2=:userid",{
        ":userid":userid
    })
    const friends2=await db.all("select user2 from friend where user1=:userid",{
        ":userid":userid
    })
    const friends=[]
    for(let i=0;i<friends1.length;i++){
        friends.push(friends1[i].user1)
    }
    for(let i=0;i<friends2.length;i++){
        friends.push(friends2[i].user2)
    }
    console.log(list[0].posterid)

    for(let i=0;i<list.length-1;i++){
        for(let j=i+1;j<list.length;j++){
            if(ifexistinlist(list[j].posterid,friends)&&!ifexistinlist(list[i].posterid,friends)){
                const temp=list[j]
                list[j]=list[i]
                list[i]=temp
            }
        }
    }
    let j
    const r=[]
    for(let i=0;i<list.length;i++){
        const u=await db.get("select name from user where id=:id",{
            ":id":list[i].posterid
        })
        j={id:list[i].id,body:list[i].body,date:list[i].date,name:u.name}
        r.push(j)
    }
    return r
    }else{
        const list=await db.all("select * from post order by id desc limit 100")
        let j
        const r=[]
        for(let i=0;i<list.length;i++){
            const u=await db.get("select name from user where id=:id",{
            ":id":list[i].posterid
        })
        j={id:list[i].id,body:list[i].body,date:list[i].date,name:u.name}
        r.push(j)
    }
        return r
    }
}





module.exports={feed}