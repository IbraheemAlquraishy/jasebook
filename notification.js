const {openDb}=require("./database")

//type post=1,comment=2,like=3,friend=4
async function noty(recy,seny,type,id){
    const db=await openDb()
    if(type==1){
        await db.run("insert into noty (recyid,senyid,type,etc) values(:recy,:seny,1,:id)",{
            ":recy":recy,
            ":seny":seny,
            ":id":id
        })
    }else if(type==2){
        await db.run("insert into noty (recyid,senyid,type,etc) values(:recy,:seny,2,:id)",{
            ":recy":recy,
            ":seny":seny,
            ":id":id
        })
    }else if(type==3){
        await db.run("insert into noty (recyid,senyid,type,etc) values(:recy,:seny,3,:id)",{
            ":recy":recy,
            ":seny":seny,
            ":id":id
        })
    }else{
        await db.run("insert into noty (recyid,senyid,type) values(:recy,:seny,4)",{
            ":recy":recy,
            ":seny":seny
        })
    }
}

async function getnoty(recy){
    const db=await openDb()
    const d=await db.all("select * from noty where recyid=:recy",{
        ":recy":recy.id
    })
    const r=[]
    let j
    for(let i=0;i<d.length;i++){
      const x=await db.get("select name from user where id=:id",{
        ":id":d[i].senyid
      })

      j={id:d[i].id,sender:x.name,type:d[i].type,etc:d[i].etc}
      r.push(j)
    }
    return r
}

async function denoty(id){
    const db=await openDb()
    await db.run("delete from noty where id=:id",{
        ":id":id
    })

}


module.exports={noty,getnoty,denoty}