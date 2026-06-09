import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function JoinPage(){
  const [roomCode,setRoomCode] = useState('')
  const [nickname,setNickname] = useState('')
  const navigate = useNavigate()

  const join = async () => {
    if(!roomCode || !nickname) return
    localStorage.setItem('nickname', nickname)
    navigate(`/play/${roomCode}`)
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Survey Stair Climb</h1>
        <p>Join a live room.</p>
        <input placeholder="Room Code" value={roomCode} onChange={e=>setRoomCode(e.target.value)} />
        <br/><br/>
        <input placeholder="Nickname" value={nickname} onChange={e=>setNickname(e.target.value)} />
        <br/><br/>
        <button onClick={join}>Join Game</button>
      </div>
    </div>
  )
}
