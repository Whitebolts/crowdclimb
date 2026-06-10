
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

    const { data: existingPlayer, error: existingPlayerError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .eq('nickname', nickname)
      .maybeSingle()

    if (existingPlayerError) {
      console.error('Existing player lookup error:', existingPlayerError)
      alert(`Player lookup error: ${existingPlayerError.message}`)
      setLoading(false)
      return
    }

    let playerRecord = existingPlayer

    if (!playerRecord) {
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

      playerRecord = player
    }

    localStorage.setItem('nickname', nickname)
    localStorage.setItem('playerId', playerRecord.id)
    localStorage.setItem('roomId', room.id)
    localStorage.setItem('roomCode', room.room_code)

    navigate(`/play/${roomCode}`)
    setLoading(false)
  }

  return (
    <div className="joinScreen">
      <div className="joinOverlay" />

      <div className="joinShell">
        <div className="joinBrandBlock">
  <img
    src="/crowd-climb-logo.png"
    alt="Crowd Climb"
    className="joinLogo"
    onError={(e) => {
      e.currentTarget.style.display = 'none'
    }}
  />
</div>

        <div className="joinCardHero">
          <h2>Join a Game</h2>
          <p>Enter the room code from your host and choose a nickname.</p>

          <input
            placeholder="Room Code"
            value={roomCode}
            onChange={e => setRoomCode(e.target.value)}
          />

          <input
            placeholder="Nickname"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
          />

          <button onClick={join} disabled={loading}>
            {loading ? 'Joining...' : 'Join Crowd Climb'}
          </button>
        </div>
      </div>
    </div>
  )
}
