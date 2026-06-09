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
  const [roomStatus, setRoomStatus] = useState('lobby')
  const [revealResult, setRevealResult] = useState(null)

  const fetchPlayers = async (targetRoomId) => {
    if (!targetRoomId) return

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', targetRoomId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Player fetch error:', error)
      return
    }

    setPlayers(data || [])
  }

  const fetchRoomState = async (targetRoomId) => {
    if (!targetRoomId) return

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, current_question, status')
      .eq('id', targetRoomId)
      .maybeSingle()

    if (roomError) {
      console.error('Room state fetch error:', roomError)
      return
    }

    if (!room) return

    setCurrentQuestion(room.current_question)
    setRoomStatus(room.status)

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, question_text, question_order')
      .eq('room_id', targetRoomId)
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

  useEffect(() => {
    if (!roomId) return

    fetchPlayers(roomId)
    fetchRoomState(roomId)

    const interval = setInterval(() => {
      fetchPlayers(roomId)
      fetchRoomState(roomId)
    }, 2000)

    return () => clearInterval(interval)
  }, [roomId])

  const startGame = async () => {
    let currentRoomId

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

    const { count, error: countError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', currentRoomId)

    if (countError) {
      console.error('Question count error:', countError)
      alert(`Question count error: ${countError.message}`)
      return
    }

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

    setRoomId(currentRoomId)
    setRevealResult(null)

    await fetchPlayers(currentRoomId)
    await fetchRoomState(currentRoomId)

    alert('Game started')
  }

  const reveal = async () => {
    if (!roomId) {
      alert('Start the game first')
      return
    }

    // Prevent double-scoring
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('current_question, status')
      .eq('id', roomId)
      .maybeSingle()

    if (roomError) {
      console.error('Room fetch error:', roomError)
      alert(`Could not load room state: ${roomError.message}`)
      return
    }

    if (!room) {
      alert('Room not found')
      return
    }

    if (room.status === 'reveal') {
      alert('This question has already been revealed')
      return
    }

    const { data: questionRow, error: questionError } = await supabase
      .from('questions')
      .select('id, question_text')
      .eq('room_id', roomId)
      .eq('question_order', room.current_question)
      .maybeSingle()

    if (questionError) {
      console.error('Question fetch error:', questionError)
      alert(`Could not load question: ${questionError.message}`)
      return
    }

    if (!questionRow) {
      alert('No question found')
      return
    }

    const { data: submissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('nickname, answer')
      .eq('room_id', roomId)
      .eq('question_id', questionRow.id)

    if (submissionsError) {
      console.error('Submission fetch error:', submissionsError)
      alert(`Could not load submissions: ${submissionsError.message}`)
      return
    }

    if (!submissions || submissions.length === 0) {
      alert('No submissions yet for this question')
      return
    }

    // Count answers
    const counts = {}
    submissions.forEach(sub => {
      counts[sub.answer] = (counts[sub.answer] || 0) + 1
    })

    const max = Math.max(...Object.values(counts))
    const winningAnswers = Object.keys(counts).filter(
      answer => counts[answer] === max
    )

    const winningNicknames = submissions
      .filter(sub => winningAnswers.includes(sub.answer))
      .map(sub => sub.nickname)

    // Award points
    const { data: currentPlayers, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)

    if (playersError) {
      console.error('Players fetch error:', playersError)
      alert(`Could not load players: ${playersError.message}`)
      return
    }

    for (const player of currentPlayers) {
      if (winningNicknames.includes(player.nickname)) {
        const { error: updateError } = await supabase
          .from('players')
          .update({ score: player.score + 1 })
          .eq('id', player.id)

        if (updateError) {
          console.error('Player score update error:', updateError)
          alert(`Could not update score: ${updateError.message}`)
          return
        }
      }
    }

    // Mark room as revealed so reveal cannot score twice
    const { error: roomUpdateError } = await supabase
      .from('rooms')
      .update({ status: 'reveal' })
      .eq('id', roomId)

    if (roomUpdateError) {
      console.error('Room status update error:', roomUpdateError)
      alert(`Could not update room status: ${roomUpdateError.message}`)
      return
    }

    setRevealResult({
      winningAnswers,
      counts,
      winningNicknames
    })

    await fetchPlayers(roomId)
    await fetchRoomState(roomId)
  }

  const nextQuestion = async () => {
    if (!roomId) {
      alert('Start the game first')
      return
    }

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('current_question')
      .eq('id', roomId)
      .maybeSingle()

    if (roomError) {
      console.error('Room fetch error:', roomError)
      alert(`Could not load room state: ${roomError.message}`)
      return
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, question_order')
      .eq('room_id', roomId)
      .order('question_order', { ascending: true })

    if (questionsError) {
      console.error('Questions fetch error:', questionsError)
      alert(`Could not load questions: ${questionsError.message}`)
      return
    }

    const totalQuestions = questions.length
    const nextIndex = room.current_question + 1

    if (nextIndex >= totalQuestions) {
      alert('No more questions in this room')
      return
    }

    const { error: updateError } = await supabase
      .from('rooms')
      .update({
        current_question: nextIndex,
        status: 'question'
      })
      .eq('id', roomId)

    if (updateError) {
      console.error('Next question error:', updateError)
      alert(`Could not move to next question: ${updateError.message}`)
      return
    }

    setRevealResult(null)
    await fetchRoomState(roomId)
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Host Screen</h1>
        <h2>Room Code: {roomCode}</h2>

        <button onClick={startGame}>
          Start Game
        </button>

        <button style={{ marginLeft: 10 }} onClick={reveal}>
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
        <h2>Reveal Results</h2>
        {!revealResult ? (
          <p>No reveal yet for this question.</p>
        ) : (
          <>
            <p><strong>Winning answer(s):</strong> {revealResult.winningAnswers.join(' / ')}</p>
            <p><strong>Counts:</strong></p>
            {Object.entries(revealResult.counts).map(([answer, count]) => (
              <div key={answer}>
                {answer}: {count}
              </div>
            ))}
            <br />
            <p><strong>Players who moved up:</strong></p>
            {revealResult.winningNicknames.map(name => (
              <div key={name}>{name}</div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>Connected Players / Scores</h2>
        {players.length === 0 ? (
          <p>No players joined this room yet.</p>
        ) : (
          players.map(player => (
            <div key={player.id}>
              {player.nickname} — {player.score}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
