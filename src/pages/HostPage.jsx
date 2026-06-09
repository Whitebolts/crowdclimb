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
  const [roomId, setRoomId] = useState(null)
  const [players, setPlayers] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [questionCount, setQuestionCount] = useState(0)
  const [currentQuestionText, setCurrentQuestionText] = useState('')

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

    const fetchRoomState = async () => {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('current_question, status')
        .eq('id', roomId)
        .maybeSingle()

      if (roomError) {
        console.error('Room state fetch error:', roomError)
        return
      }

      if (!room) return

      setCurrentQuestion(room.current_question)

      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, question_text, question_order')
        .eq('room_id', roomId)
        .order('question_order', { ascending: true })

      if (questionsError) {
        console.error('Question fetch error:', questionsError)
        return
      }

      setQuestionCount(questions.length)

      const current = questions.find(
        q => q.question_order === room.current_question
      )

      setCurrentQuestionText(current ? current.question_text : 'No question found')
    }

    fetchPlayers()
    fetchRoomState()

    const playersChannel = supabase
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

    const roomChannel = supabase
      .channel(`room-state-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`
        },
        () => fetchRoomState()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(roomChannel)
    }
  }, [roomId])

  const startGame = async () => {
    let currentRoomId

    // 1. Find or create room
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

      currentRoomId = createdRoom.id
    } else {
      currentRoomId = existingRoom.id

      const { error: updateRoomError } = await supabase
        .from('rooms')
        .update({
          status: 'question',
          current_question: 0
        })
        .eq('id', currentRoomId)

      if (updateRoomError) {
        console.error('Room update error:', updateRoomError)
        alert(`Could not start game: ${updateRoomError.message}`)
        return
      }
    }

    setRoomId(currentRoomId)

    // 2. Check if room already has questions
    const { count, error: countError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', currentRoomId)

    if (countError) {
      console.error('Question count error:', countError)
      alert(`Question count error: ${countError.message}`)
      return
    }

    // 3. Insert seed questions only if none exist
    if (count === 0) {
      for (let i = 0; i < seedQuestions.length; i++) {
        const q = seedQuestions[i]

        const { data: insertedQuestion, error: questionError } = await supabase
          .from('questions')
          .insert({
            room_id: currentRoomId,
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

  const nextQuestion = async () => {
    if (!roomId) {
      alert('Start the game first')
      return
    }

    if (currentQuestion + 1 >= questionCount) {
      alert('No more questions in this room')
      return
    }

    const { error } = await supabase
      .from('rooms')
      .update({
        current_question: currentQuestion + 1,
        status: 'question'
      })
      .eq('id', roomId)

    if (error) {
      console.error('Next question error:', error)
      alert(`Could not move to next question: ${error.message}`)
      return
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Host Screen</h1>
        <h2>Room Code: {roomCode}</h2>

        <button onClick={startGame}>
          Start Game
        </button>

        <button style={{ marginLeft: 10 }}>
          Reveal
        </button>

        <button style={{ marginLeft: 10 }} onClick={nextQuestion}>
          Next Question
        </button>
      </div>

      <div className="card">
        <h2>Current Question</h2>
        <p>
          Question {questionCount === 0 ? 0 : currentQuestion + 1} / {questionCount}
        </p>
        <p>{currentQuestionText || 'Start the game to load questions'}</p>
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
