import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PlayerPage() {
  const { roomCode } = useParams()
  const [selected, setSelected] = useState(null)
  const [question, setQuestion] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)

  useEffect(() => {
    let roomChannel

    const loadQuestion = async () => {
      // 1. Load room
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
      setCurrentQuestionIndex(room.current_question)

      // 2. Load current question
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
        setQuestion(null)
        return
      }

      // 3. Load answers
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

      // Reset UI for new question
      setSelected(null)
      setSubmitted(false)

      // 4. Check if this player already submitted for this question
      const nickname = localStorage.getItem('nickname')

      if (nickname) {
        const { data: existingSubmission, error: submissionCheckError } = await supabase
          .from('submissions')
          .select('id')
          .eq('room_id', room.id)
          .eq('nickname', nickname)
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

      // 5. Subscribe to room updates once room exists
      if (!roomChannel) {
        roomChannel = supabase
          .channel(`room-updates-${room.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'rooms',
              filter: `id=eq.${room.id}`
            },
            payload => {
              const nextIndex = payload.new.current_question

              if (nextIndex !== currentQuestionIndex) {
                loadQuestion()
              }
            }
          )
          .subscribe()
      }
    }

    loadQuestion()

    return () => {
      if (roomChannel) {
        supabase.removeChannel(roomChannel)
      }
    }
  }, [roomCode, currentQuestionIndex])

  const submitAnswer = async () => {
    if (!selected || !question || !roomId || submitted) return

    const nickname = localStorage.getItem('nickname')

    const { error } = await supabase.from('submissions').insert({
      room_id: roomId,
      question_id: question.id,
      nickname: nickname,
      answer: selected
    })

    if (error) {
      console.error('Submission error:', error)
      alert(`Could not submit answer: ${error.message}`)
      return
    }

    setSubmitted(true)
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
``
