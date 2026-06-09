import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function HostPage(){
  const [roomCode] = useState(String(Math.floor(1000 + Math.random() * 9000)))
  const [players,setPlayers] = useState([])

  
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function HostPage() {
  const [roomCode] = useState(String(Math.floor(1000 + Math.random() * 9000)))
  const [players, setPlayers] = useState([])

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data } = await supabase.from('players').select('*')
      setPlayers(data || [])
    }

    fetchPlayers()

    const channel = supabase
      .channel('players-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players'
        },
        () => fetchPlayers()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const startGame = async () => {
    const { error } = await supabase.from('rooms').insert({
      room_code: roomCode,
      status: 'question',
      current_question: 0
    })

    if (error) {
      console.error(error)
      alert('Could not start game')
      return
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
        {players.map(player => (
          <div key={player.id}>{player.nickname}</div>
        ))}
      </div>
    </div>
  )
}

        <button style={{marginLeft:10}}>Reveal</button>
        <button style={{marginLeft:10}}>Next Question</button>
      </div>

      <div className="card">
        <h2>Connected Players</h2>
        {players.map(player => (
          <div key={player.id}>{player.nickname}</div>
        ))}
      </div>
    </div>
  )
}
