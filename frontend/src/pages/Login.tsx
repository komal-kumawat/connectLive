import { useState } from 'react';
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from '../context/AuthContext';
import { BACKEND_URL } from '../config';
const Login = () => {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await axios.post(
        `${BACKEND_URL}/api/v1/users/login`,
        { username: email, password }
      );

      setSuccess("Login Successful ✅");
      login(res.data.user.name, res.data.token);
      navigate("/");

    } catch (err: any) {
      setError(err.response?.data?.message || "Login failed ❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', backgroundColor:'#f4f6f8' }}>
      <div style={{ width:'350px', padding:'30px', borderRadius:'12px', backgroundColor:'#fff', boxShadow:'0px 4px 15px rgba(0,0,0,0.1)' }}>
        <h2 style={{ textAlign:'center', marginBottom:'20px' }}>Login</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:'15px' }}>
            <label>Email</label>
            <input type="email" placeholder="Enter your Email" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #ccc', marginTop:'5px' }} />
          </div>
          <div style={{ marginBottom:'15px' }}>
            <label>Password</label>
            <input type="password" placeholder="Enter your Password" value={password} onChange={(e)=>setPassword(e.target.value)} required style={{ width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #ccc', marginTop:'5px' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width:'100%', padding:'10px', backgroundColor:'#007bff', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>
            {loading ? "Logging in..." : "Login"}
          </button>
          {error && <p style={{ color:"red", marginTop:"10px" }}>{error}</p>}
          {success && <p style={{ color:"green", marginTop:"10px" }}>{success}</p>}
          <div style={{ textAlign:'center', marginTop:'15px' }}>
            Don’t have an account? <Link to="/register">Register</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
