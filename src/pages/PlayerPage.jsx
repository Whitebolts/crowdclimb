import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PlayerPage() {
  const { roomCode } = useParams()
  const [selected, setSelected] = useState(null)
  const [question, setQuestion] = useState(null)
  const [roomId, setRoomId] = useState(null)

  useEffect(() => {
    const loadQuestion = async () => {
      // 1. Find room
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

      // 2. Find current question for this room
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

      // 3. Find answers for that question
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
    }

    loadQuestion()
  }, [roomCode])

  const submitAnswer = async () => {
    if (!selected || !question || !roomId) return

    const { error } = await supabase.from('submissions').insert({
      room_id: roomId,
      question_id: question.id,
      nickname: localStorage.getItem('nickname'),
      answer: selected
    })

    if (error) {
      console.error('Submission error:', error)
      alert(`Could not submit answer: ${error.message}`)
      return
    }

    alert('Answer submitted!')
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

        {question.answers.map(answer => (
          <div
            key={answer}
            className="option"
            onClick={() => setSelected(answer)}
            style={{
              background: selected === answer ? '#2563eb' : '#eef4ff',
              color: selected === answer ? 'white' : '#1f2937'
            }}
          >
            {answer}
          </div>
        ))}

        <br />
        <button onClick={submitAnswer}>Submit Selected Answer</button>
      </div>
    </div>
  )
}
