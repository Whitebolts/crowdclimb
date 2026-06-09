import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function HostPage() {
  const [roomCode] = useState(String(Math.floor(1000 + Math.random() * 9000)))
  const [roomId, setRoomId] = useState(null)
  const [players, setPlayers] = useState([])

  useEffect(() => {
    if (!roomId) return

    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Player fetch error:', error)
        return
      }

      setPlayers(data || [])
    }

    fetchPlayers()

    const channel = supabase
      .channel(`players-room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`
        },
        () => fetchPlayers()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  const startGame = async () => {
    const { data: existingRoom, error: lookupError } = await supabase
      .from('rooms')
      .select('id')
      .eq('room_code', roomCode)
      .maybeSingle()

    if (lookupError) {
      console.error('Room lookup error:', lookupError)
      alert(`Room lookup error: ${lookupError.message}`)
      return
    }

    if (!existingRoom) {
      const { data: createdRoom, error: insertError } = await supabase
        .from('rooms')
        .insert({
          room_code: roomCode,
          status: 'question',
          current_question: 0
        })
        .select()
        .single()

      if (insertError) {
        console.error('Insert error:', insertError)
        alert(`Could not start game: ${insertError.message}`)
        return
      }

      setRoomId(createdRoom.id)
    } else {
      const { error: updateError } = await supabase
        .from('rooms')
        .update({
          status: 'question',
          current_question: 0
        })
        .eq('id', existingRoom.id)

      if (updateError) {
        console.error('Update error:', updateError)
        alert(`Could not start game: ${updateError.message}`)
        return
      }

      setRoomId(existingRoom.id)
    }

    alert('Game started')
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Host Screen</h1>
        <h2>Room Code: {roomCode}</h2>

        <button onClick={startGame}>
          Start Game
        </button>

        <button style={{ marginLeft: 10 }}>Reveal</button>
        <button style={{ marginLeft: 10 }}>Next Question</button>
      </div>

      <div className="card">
        <h2>Connected Players</h2>
        {players.length === 0 ? (
          <p>No players joined this room yet.</p>
        ) : (
          players.map(player => (
            <div key={player.id}>{player.nickname}</div>
          ))
        )}
      </div>
    </div>
  )
}
