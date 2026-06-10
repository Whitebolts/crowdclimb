
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

  if (roomStatus === 'finished') {
    return (
      <div className="playerScreen">
        <div className="playerOverlay" />
        <div className="playerShell playerCenteredShell">
          <div className="playerCardHero playerEndCard">
            <img
              src="/crowd-climb-logo.svg"
              alt="Crowd Climb"
              className="playerLogoSmall"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <h2>Game finished</h2>
            <p>Thanks for playing Crowd Climb.</p>
            <p>Watch for the next room code from your host.</p>
            <button onClick={returnToJoinPage}>Return to Join Page</button>
          </div>
        </div>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="playerScreen">
        <div className="playerOverlay" />
        <div className="playerShell playerCenteredShell">
          <div className="playerCardHero">
            <img
              src="/crowd-climb-logo.svg"
              alt="Crowd Climb"
              className="playerLogoSmall"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <h2>Room {roomCode}</h2>
            <p>Loading question...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="playerScreen">
      <div className="playerOverlay" />
      <div className="playerShell playerCenteredShell">
        <div className="playerCardHero">
          <img
            src="/crowd-climb-logo.svg"
            alt="Crowd Climb"
            className="playerLogoSmall"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />

          <div className="playerRoomLabel">Room {roomCode}</div>
          <h2 className="playerQuestionTitle">{question.text}</h2>

          {submitted ? (
            <p><strong>Answer submitted. Waiting for the next question...</strong></p>
          ) : (
            <>
              <div className="playerOptionsGrid">
                {question.answers.map(answer => (
                  <div
                    key={answer}
                    className={`option playerOption ${selected === answer ? 'playerOptionSelected' : ''}`}
                    onClick={() => setSelected(answer)}
                  >
                    {answer}
                  </div>
                ))}
              </div>

              <button onClick={submitAnswer} disabled={!selected}>
                Submit Selected Answer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
