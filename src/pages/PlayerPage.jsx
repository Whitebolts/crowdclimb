import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PlayerPage(){
  const { roomCode } = useParams()
  const [selected,setSelected] = useState(null)

  const question = {
    text: 'Which snack would most people choose?',
    answers: ['Popcorn','Chips','Chocolate','Fruit']
  }

  const submitAnswer = async () => {
    if(!selected) return

    await supabase.from('submissions').insert({
      room_code: roomCode,
      nickname: localStorage.getItem('nickname'),
      answer: selected
    })

    alert('Answer submitted!')
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
            onClick={()=>setSelected(answer)}
            style={{
              background:selected===answer ? '#2563eb' : '#eef4ff',
              color:selected===answer ? 'white' : '#1f2937'
            }}
          >
            {answer}
          </div>
        ))}

        <br/>
        <button onClick={submitAnswer}>Submit Selected Answer</button>
      </div>
    </div>
  )
}
