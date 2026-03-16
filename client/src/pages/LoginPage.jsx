import { useState } from "react"
import { supabase } from "../lib/supabase"

export default function LoginPage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const login = async (e) => {
    e.preventDefault()

    const { error } = await supabase.auth.signInWithPassword({
      email: "sandrvlad@gmail.com",
      password: password,
    })

    if (error) {
      setError(error.message)
    } else {
      window.location.href = "/dashboard"
    }
  }

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background:"#020817"
    }}>
      <form
        onSubmit={login}
        style={{
          background:"#0f172a",
          padding:"40px",
          borderRadius:"12px",
          width:"320px"
        }}
      >
        <h2 style={{color:"white"}}>Login</h2>

        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          style={{
            width:"100%",
            padding:"10px",
            marginTop:"15px"
          }}
        />

        <button
          type="submit"
          style={{
            width:"100%",
            marginTop:"20px",
            padding:"10px",
            background:"#2563eb",
            color:"white",
            border:"none"
          }}
        >
          Login
        </button>

        {error && <p style={{color:"red"}}>{error}</p>}
      </form>
    </div>
  )
}
