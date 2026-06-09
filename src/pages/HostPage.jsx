import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const seedQuestions = [
  {
    question_text: 'Which superhero would this room choose most often?',
    answers: ['Spider-Man', 'Superman', 'Batman', 'Wonder Woman']
  },
  {
    question_text: 'Which drink would most people choose?',
    answers: ['Coffee', 'Tea', 'Water', 'Pop']
  },
  {
    question_text: 'Which season feels shortest?',
    answers: ['Summer', 'Fall', 'Winter', 'Spring']
  }
]

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
    // 1. Find or create the room
    let roomId

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
      const { data: createdRoom, error: insertRoomError } = await supabase
        .from('rooms')
        .insert({
          room_code: roomCode,
          status: 'question',
          current_question: 0
        })
        .select()
        .single()

      if (insertRoomError) {
        console.error('Room insert error:', insertRoomError)
        alert(`Could not start game: ${insertRoomError.message}`)
        return
      }

      roomId = createdRoom.id
    } else {
      roomId = existingRoom.id

      const { error: updateRoomError } = await supabase
        .from('rooms')
        .update({
          status: 'question',
          current_question: 0
        })
        .eq('id', roomId)

      if (updateRoomError) {
        console.error('Room update error:', updateRoomError)
        alert(`Could not start game: ${updateRoomError.message}`)
        return
      }
    }

    // 2. Check if this room already has questions
    const { count, error: countError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)

    if (countError) {
      console.error('Question count error:', countError)
      alert(`Question count error: ${countError.message}`)
      return
    }

    // 3. Insert seed questions if none exist
    if (count === 0) {
      for (let i = 0; i < seedQuestions.length; i++) {
        const q = seedQuestions[i]

        const { data: insertedQuestion, error: questionError } = await supabase
          .from('questions')
          .insert({
            room_id: roomId,
            question_text: q.question_text,
            question_order: i
          })
          .select()
          .single()

        if (questionError) {
          console.error('Question insert error:', questionError)
          alert(`Question insert error: ${questionError.message}`)
          return
        }

        const answerRows = q.answers.map((answer, index) => ({
          question_id: insertedQuestion.id,
          answer_text: answer,
          answer_order: index
        }))

        const { error: answersError } = await supabase
          .from('answers')
          .insert(answerRows)

        if (answersError) {
          console.error('Answer insert error:', answersError)
          alert(`Answer insert error: ${answersError.message}`)
          return
        }
      }
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
