import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function JoinPage() {
  const [roomCode, setRoomCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const join = async () => {
    if (!roomCode || !nickname) {
      alert('Enter a room code and nickname')
      return
    }

    setLoading(true)

    // 1. Find the room
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, room_code, status')
      .eq('room_code', roomCode)
      .maybeSingle()

    if (roomError) {
      console.error('Room lookup error:', roomError)
      alert(`Room lookup error: ${roomError.message}`)
      setLoading(false)
      return
    }

    if (!room) {
      alert('Room not found')
      setLoading(false)
      return
    }

    // 2. Insert player into players table
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        room_id: room.id,
        nickname,
        score: 0
      })
      .select()
      .single()

    if (playerError) {
      console.error('Player insert error:', playerError)
      alert(`Could not join room: ${playerError.message}`)
      setLoading(false)
      return
    }

    // 3. Save local info for later use
    localStorage.setItem('nickname', nickname)
    localStorage.setItem('playerId', player.id)
    localStorage.setItem('roomId', room.id)
    localStorage.setItem('roomCode', room.room_code)

    // 4. Go to the player page
    navigate(`/play/${roomCode}`)

    setLoading(false)
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Survey Stair Climb</h1>
        <p>Join a live room.</p>

        <input
          placeholder="Room Code"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value)}
        />

        <br /><br />

        <input
          placeholder="Nickname"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
        />

        <br /><br />

        <button onClick={join} disabled={loading}>
          {loading ? 'Joining...' : 'Join Game'}
        </button>
      </div>
    </div>
  )
}
