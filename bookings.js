// routes/bookings.js

const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("./database");

const router = express.Router();


// ساعات کاری زمین
const HOURS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00"
];



function rangeOverlaps(
  startA,
  durationA,
  startB,
  durationB
){

  const a =
    HOURS.indexOf(startA);

  const b =
    HOURS.indexOf(startB);


  if(a < 0 || b < 0)
    return false;


  return (
    a < b + durationB &&
    b < a + durationA
  );

}




// ======================================================
// دریافت همه رزروهای یک روز
// ======================================================

router.get(
"/courts-reservations",
(req,res)=>{


try{


const {date}=req.query;


let sql=`

SELECT

cr.*,

u.name AS user_name,

c.name AS court_name


FROM court_reservations cr


LEFT JOIN users u
ON u.id = cr.user_id


LEFT JOIN courts c
ON c.id = cr.court_id

`;


let rows;


if(date){

rows=db.prepare(
sql+
`
WHERE cr.date=?

ORDER BY cr.start_hour
`
)
.all(date);


}else{


rows=db.prepare(
sql+
`
ORDER BY cr.date,cr.start_hour
`
)
.all();


}


res.json({

reservations:rows

});



}catch(e){


console.log(e);


res.status(500).json({

error:"Cannot load reservations"

});


}


});





// ======================================================
// دریافت رزروهای یک زمین خاص
// مثال:
// /api/bookings/court/1/reservations
// ======================================================


router.get(
"/court/:id/reservations",
(req,res)=>{


try{


const courtId=req.params.id;

const {date}=req.query;



let query=`

SELECT

cr.*,

u.name AS user_name,

c.name AS court_name


FROM court_reservations cr


LEFT JOIN users u
ON u.id=cr.user_id


LEFT JOIN courts c
ON c.id=cr.court_id


WHERE cr.court_id=?

`;



let rows;



if(date){


rows=db.prepare(

query+

`
AND cr.date=?

ORDER BY cr.start_hour

`

)
.all(
courtId,
date
);



}else{


rows=db.prepare(

query+

`
ORDER BY cr.date,cr.start_hour

`

)
.all(
courtId
);



}



res.json({

success:true,

courtId,

reservations:rows

});



}catch(e){


console.log(e);


res.status(500).json({

success:false,

error:
"Cannot load court reservations"

});


}


});







// ======================================================
// ثبت رزرو زمین
// ======================================================


router.post(
"/court",
(req,res)=>{


try{


const {

courtId,

userId,

date,

startHour,

durationHours,

needsPartner


}=req.body;



if(
!courtId ||
!userId ||
!date ||
!startHour ||
!durationHours
){

return res.status(400).json({

error:"اطلاعات ناقص است"

});

}




const old =
db.prepare(

`

SELECT *

FROM court_reservations

WHERE court_id=?

AND date=?

`

)
.all(
courtId,
date
);





const conflict =
old.some(r=>

rangeOverlaps(

startHour,

durationHours,

r.start_hour,

r.duration_hours

)

);



if(conflict){


return res.status(409).json({

error:
"این زمان قبلا رزرو شده است"

});


}




const id =
"res-"+uuid()
.slice(0,8);





db.prepare(

`

INSERT INTO court_reservations

(

id,

court_id,

user_id,

date,

start_hour,

duration_hours,

needs_partner

)

VALUES(?,?,?,?,?,?,?)

`

)
.run(

id,

courtId,

userId,

date,

startHour,

durationHours,

needsPartner ? 1:0

);





res.status(201).json({

success:true,

id

});





}catch(e){


console.log(e);


res.status(500).json({

error:"Reservation failed"

});


}


});






// ======================================================
// حذف رزرو
// ======================================================


router.delete(
"/court/:id",
(req,res)=>{


db.prepare(

`

DELETE FROM court_reservations

WHERE id=?

`

)
.run(
req.params.id
);


res.json({

success:true

});


});





module.exports = router;
