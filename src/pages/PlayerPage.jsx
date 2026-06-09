import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PlayerPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()

  const [question, setQuestion] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [currentQuestionId, setCurrentQuestionId] = useState(null)
  const [roomStatus, setRoomStatus] = useState('lobby')

  const loadQuestion = async () => {
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, current_question, status')
      .eq('room_code', roomCode)
      .maybeSingle()

    if (roomError) {
      console.error('Room fetch error:', roomError)
      return
    }

    if (!room) {
      console.error('Room not found')
      return
    }

    setRoomId(room.id)
    setRoomStatus(room.status)

    // If the host has finished the game, stop loading more questions
    if (room.status === 'finished') {
      setQuestion(null)
      setSubmitted(false)
      setSelected(null)
      return
    }

    const { data: questionRow, error: questionError } = await supabase
      .from('questions')
      .select('id, question_text, question_order')
      .eq('room_id', room.id)
      .eq('question_order', room.current_question)
      .maybeSingle()

    if (questionError) {
      console.error('Question fetch error:', questionError)
      return
    }

    if (!questionRow) {
      console.error('No question found for this room')
      return
    }

    // If this is the same active question, don't rebuild the state unnecessarily
    if (questionRow.id === currentQuestionId) {
      return
    }

    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select('id, answer_text, answer_order')
      .eq('question_id', questionRow.id)
      .order('answer_order', { ascending: true })

    if (answersError) {
      console.error('Answers fetch error:', answersError)
      return
    }

    setQuestion({
      id: questionRow.id,
      text: questionRow.question_text,
      answers: answers.map(a => a.answer_text)
    })

    setCurrentQuestionId(questionRow.id)
    setSelected(null)
    setSubmitted(false)

    const playerId = localStorage.getItem('playerId')

    if (playerId) {
      const { data: existingSubmission, error: submissionCheckError } = await supabase
        .from('submissions')
        .select('id')
        .eq('room_id', room.id)
        .eq('player_id', playerId)
        .eq('question_id', questionRow.id)
        .maybeSingle()

      if (submissionCheckError) {
        console.error('Submission check error:', submissionCheckError)
        return
      }

      if (existingSubmission) {
        setSubmitted(true)
      }
    }
  }

  useEffect(() => {
    loadQuestion()

    const interval = setInterval(() => {
      loadQuestion()
    }, 2000)

    return () => clearInterval(interval)
  }, [roomCode, currentQuestionId])

  const submitAnswer = async () => {
    if (!selected || !question || !roomId || submitted) return

    const playerId = localStorage.getItem('playerId')
    const nickname = localStorage.getItem('nickname')

    if (!playerId) {
      alert('Missing player ID. Please rejoin the room.')
      return
    }

    const { error } = await supabase.from('submissions').insert({
      room_id: roomId,
      player_id: playerId,
      question_id: question.id,
      nickname,
      answer: selected
    })

    if (error) {
      console.error('Submission error:', error)
      alert(`Could not submit answer: ${error.message}`)
      return
    }

    setSubmitted(true)
  }

  const returnToJoinPage = () => {
    localStorage.removeItem('roomId')
    localStorage.removeItem('roomCode')
    localStorage.removeItem('playerId')
    localStorage.removeItem('nickname')
    navigate('/')
  }

  // End-of-game screen
  if (roomStatus === 'finished') {
    return (
      <div className="container">
        <div className="card">
          <h1>Room {roomCode}</h1>
          <h2>Game finished</h2>
          <p>The game has ended. You can return to the join page to enter a new room code.</p>
          <button onClick={returnToJoinPage}>
            Return to Join Page
          </button>
        </div>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="container">
        <div className="card">
          <h1>Room {roomCode}</h1>
          <p>Loading question...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Room {roomCode}</h1>
        <h2>{question.text}</h2>

        {submitted ? (
          <p><strong>Answer submitted. Waiting for the next question...</strong></p>
        ) : (
          <>
            {question.answers.map(answer => (
              <div
                key={answer}
                className="option"
                onClick={() => setSelected(answer)}
                style={{
                  background: selected === answer ? '#2563eb' : '#eef4ff',
                  color: selected === answer ? 'white' : '#1f2937',
                  cursor: 'pointer'
                }}
              >
                {answer}
              </div>
            ))}

            <br />
            <button onClick={submitAnswer} disabled={!selected}>
              Submit Selected Answer
            </button>
          </>
        )}
      </div>
    </div>
  )
}
