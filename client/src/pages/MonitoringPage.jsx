import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

export default function MonitoringPage() {

const [data,setData]=useState([])

async function loadData(){

const {data,error}=await supabase
.from("v_asset_points_latest")
.select("*")

if(!error)setData(data)

}

useEffect(()=>{

loadData()

const timer=setInterval(loadData,5000)

return()=>clearInterval(timer)

},[])

return(

<div style={{padding:20,fontFamily:"Arial"}}>

<h1>Farmplast Monitoring</h1>

{data.map(p=>(

<div key={p.point_id}
style={{
border:"1px solid #ddd",
padding:10,
marginBottom:8
}}>

<b>{p.asset_name}</b> — {p.point_name} : {p.value_number ?? p.value_boolean ?? p.value_text}

</div>

))}

</div>

)

}