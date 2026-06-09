
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const starterQuestions = [
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
  const [submissions, setSubmissions] = useState([])

  const [draftQuestion, setDraftQuestion] = useState('')
  const [draftAnswers, setDraftAnswers] = useState(['', '', '', ''])
  const [customQuestions, setCustomQuestions] = useState([])
  const [showQuestionBuilder, setShowQuestionBuilder] = useState(true)

  const usingQuestions =
    customQuestions.length > 0 ? customQuestions : starterQuestions

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

  const fetchSubmissions = async (targetRoomId, questionOrderArg = null) => {
    if (!targetRoomId) return

    const questionOrder = questionOrderArg ?? currentQuestion

    const { data: questionRow, error: questionError } = await supabase
      .from('questions')
      .select('id')
      .eq('room_id', targetRoomId)
      .eq('question_order', questionOrder)
      .maybeSingle()

    if (questionError) {
      console.error('Submission question lookup error:', questionError)
      return
    }

    if (!questionRow) {
      setSubmissions([])
      return
    }

    const { data, error } = await supabase
      .from('submissions')
      .select('player_id, nickname, answer')
      .eq('room_id', targetRoomId)
      .eq('question_id', questionRow.id)

    if (error) {
      console.error('Submissions fetch error:', error)
      return
    }

    setSubmissions(data || [])
  }

  useEffect(() => {
    if (!roomId) return

    const runRefresh = async () => {
      await fetchPlayers(roomId)
      await fetchRoomState(roomId)
      await fetchSubmissions(roomId)
    }

    runRefresh()

    const interval = setInterval(() => {
      runRefresh()
    }, 2000)

    return () => clearInterval(interval)
  }, [roomId, currentQuestion])

  const addQuestionDraft = () => {
    const prompt = draftQuestion.trim()
    const answers = draftAnswers.map(a => a.trim()).filter(Boolean)

    if (!prompt || answers.length < 2 || answers.length > 4) {
      alert('Enter a question and between 2 and 4 answers.')
      return
    }

    setCustomQuestions(prev => [
      ...prev,
      {
        question_text: prompt,
        answers
      }
    ])

    setDraftQuestion('')
    setDraftAnswers(['', '', '', ''])
  }

  const removeQuestion = (index) => {
    setCustomQuestions(prev => prev.filter((_, i) => i !== index))
  }

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

    const { data: roomPlayers, error: roomPlayersError } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', currentRoomId)

    if (roomPlayersError) {
      console.error('Players lookup error:', roomPlayersError)
      alert(`Could not reset player scores: ${roomPlayersError.message}`)
      return
    }

    for (const player of roomPlayers || []) {
      const { error: scoreResetError } = await supabase
        .from('players')
        .update({ score: 0 })
        .eq('id', player.id)

      if (scoreResetError) {
        console.error('Score reset error:', scoreResetError)
        alert(`Could not reset player scores: ${scoreResetError.message}`)
        return
      }
    }

    const { error: deleteQuestionsError } = await supabase
      .from('questions')
      .delete()
      .eq('room_id', currentRoomId)

    if (deleteQuestionsError) {
      console.error('Question delete error:', deleteQuestionsError)
      alert(`Could not reset previous questions: ${deleteQuestionsError.message}`)
      return
    }

    for (let i = 0; i < usingQuestions.length; i++) {
      const q = usingQuestions[i]

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

    // clear old submissions and start fresh
    const { error: deleteSubmissionsError } = await supabase
      .from('submissions')
      .delete()
      .eq('room_id', currentRoomId)

    if (deleteSubmissionsError) {
      console.error('Submissions delete error:', deleteSubmissionsError)
      alert(`Could not clear previous submissions: ${deleteSubmissionsError.message}`)
      return
    }

    setRoomId(currentRoomId)
    setRevealResult(null)
    setShowQuestionBuilder(false)

    await fetchPlayers(currentRoomId)
    await fetchRoomState(currentRoomId)
    await fetchSubmissions(currentRoomId, 0)

    alert('Game started')
  }

  const reveal = async () => {
    if (!roomId) {
      alert('Start the game first')
      return
    }

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

    if (room.status === 'reveal' || room.status === 'finished') {
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

    const { data: currentSubmissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('player_id, nickname, answer')
      .eq('room_id', roomId)
      .eq('question_id', questionRow.id)

    if (submissionsError) {
      console.error('Submission fetch error:', submissionsError)
      alert(`Could not load submissions: ${submissionsError.message}`)
      return
    }

    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No submissions yet for this question')
      return
    }

    const counts = {}
    currentSubmissions.forEach(sub => {
      counts[sub.answer] = (counts[sub.answer] || 0) + 1
    })

    const max = Math.max(...Object.values(counts))
    const winningAnswers = Object.keys(counts).filter(
      answer => counts[answer] === max
    )

    const winningPlayerIds = currentSubmissions
      .filter(sub => winningAnswers.includes(sub.answer))
      .map(sub => sub.player_id)

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
      if (winningPlayerIds.includes(player.id)) {
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

    const statusForRoom = room.current_question + 1 >= questionCount ? 'finished' : 'reveal'

    const { error: roomUpdateError } = await supabase
      .from('rooms')
      .update({ status: statusForRoom })
      .eq('id', roomId)

    if (roomUpdateError) {
      console.error('Room status update error:', roomUpdateError)
      alert(`Could not update room status: ${roomUpdateError.message}`)
      return
    }

    setRevealResult({
      winningAnswers,
      counts,
      winningPlayerIds
    })

    setSubmissions(currentSubmissions)

    await fetchPlayers(roomId)
    await fetchRoomState(roomId)
  }

  const restartGame = async () => {
    if (!roomId) {
      alert('Start the game first')
      return
    }

    // reset scores
    for (const player of players) {
      const { error: scoreResetError } = await supabase
        .from('players')
        .update({ score: 0 })
        .eq('id', player.id)

      if (scoreResetError) {
        console.error('Score reset error:', scoreResetError)
        alert(`Could not reset player scores: ${scoreResetError.message}`)
        return
      }
    }

    // clear submissions but keep current questions/answers
    const { error: deleteSubmissionsError } = await supabase
      .from('submissions')
      .delete()
      .eq('room_id', roomId)

    if (deleteSubmissionsError) {
      console.error('Submissions delete error:', deleteSubmissionsError)
      alert(`Could not clear submissions: ${deleteSubmissionsError.message}`)
      return
    }

    const { error: roomResetError } = await supabase
      .from('rooms')
      .update({
        current_question: 0,
        status: 'question'
      })
      .eq('id', roomId)

    if (roomResetError) {
      console.error('Room reset error:', roomResetError)
      alert(`Could not restart game: ${roomResetError.message}`)
      return
    }

    setRevealResult(null)
    setSubmissions([])
    setShowQuestionBuilder(false)

    await fetchPlayers(roomId)
    await fetchRoomState(roomId)
    await fetchSubmissions(roomId, 0)

    alert('Game restarted using the existing question set')
  }

  const resetGame = async () => {
    const confirmed = window.confirm(
      'Warning: proceeding will erase all questions, players, submissions, and scores for this room. Do you want to continue?'
    )

    if (!confirmed) return

    if (roomId) {
      const { error: deleteRoomError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId)

      if (deleteRoomError) {
        console.error('Room delete error:', deleteRoomError)
        alert(`Could not reset room: ${deleteRoomError.message}`)
        return
      }
    }

    window.location.reload()
  }

  const nextQuestion = async () => {
    if (!roomId) {
      alert('Start the game first')
      return
    }

    if (roomStatus !== 'reveal') {
      alert('Reveal the current question before moving to the next one')
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
    setSubmissions([])
    await fetchRoomState(roomId)
    await fetchSubmissions(roomId, nextIndex)
  }

  const sortedPlayers = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.nickname.localeCompare(b.nickname)
  })

  const highestScore =
    sortedPlayers.length > 0 ? Math.max(...sortedPlayers.map(p => p.score)) : 0

  const winnerNames = sortedPlayers
    .filter(player => player.score === highestScore)
    .map(player => player.nickname)

  const submittedMap = {}
  submissions.forEach(sub => {
    if (sub.player_id) {
      submittedMap[sub.player_id] = sub.answer
    }
  })

  const isGameFinished = roomStatus === 'finished' && questionCount > 0

  return (
    <div className="container">
      <div className="card">
        <h1>Host Screen</h1>
        <h2>Room Code: {roomCode}</h2>

        <button onClick={startGame}>Start Game</button>
        <button style={{ marginLeft: 10 }} onClick={reveal}>Reveal</button>
        <button
          style={{ marginLeft: 10 }}
          onClick={nextQuestion}
          disabled={roomStatus !== 'reveal'}
        >
          Next Question
        </button>
        <button style={{ marginLeft: 10 }} onClick={restartGame}>Restart Game</button>
        <button style={{ marginLeft: 10 }} onClick={resetGame}>Reset</button>
        <button
          style={{ marginLeft: 10 }}
          onClick={() => setShowQuestionBuilder(prev => !prev)}
        >
          {showQuestionBuilder ? 'Hide Questions' : 'Show Questions'}
        </button>
      </div>

      {showQuestionBuilder && (
        <div className="card">
          <h2>Question Builder</h2>
          <p>
            Add your own room questions below. If you leave this blank, the starter stock questions will be used.
          </p>

          <textarea
            value={draftQuestion}
            onChange={(e) => setDraftQuestion(e.target.value)}
            placeholder="Enter question prompt"
          />

          <input
            value={draftAnswers[0]}
            onChange={(e) => setDraftAnswers(prev => [e.target.value, prev[1], prev[2], prev[3]])}
            placeholder="Answer 1"
          />
          <input
            value={draftAnswers[1]}
            onChange={(e) => setDraftAnswers(prev => [prev[0], e.target.value, prev[2], prev[3]])}
            placeholder="Answer 2"
          />
          <input
            value={draftAnswers[2]}
            onChange={(e) => setDraftAnswers(prev => [prev[0], prev[1], e.target.value, prev[3]])}
            placeholder="Answer 3 (optional)"
          />
          <input
            value={draftAnswers[3]}
            onChange={(e) => setDraftAnswers(prev => [prev[0], prev[1], prev[2], e.target.value])}
            placeholder="Answer 4 (optional)"
          />

          <button onClick={addQuestionDraft}>Add Question</button>

          <div style={{ marginTop: 16 }}>
            <strong>Question Set For This Room</strong>
            {usingQuestions.map((q, index) => (
              <div
                key={index}
                className="card"
                style={{ marginTop: 12, marginBottom: 0, padding: 14 }}
              >
                <div>
                  <strong>{index + 1}. {q.question_text}</strong>
                </div>
                <div style={{ marginTop: 8 }}>{q.answers.join(' • ')}</div>
                {customQuestions.length > 0 && (
                  <button
                    style={{ marginTop: 10 }}
                    onClick={() => removeQuestion(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Current Question</h2>
        <p>
          Question {questionCount === 0 ? 0 : currentQuestion + 1} / {questionCount}
        </p>
        <p>{currentQuestionText || 'Start the game to load questions'}</p>
      </div>

      <div className="card">
        <h2>Submission Status</h2>
        {players.length === 0 ? (
          <p>No players joined this room yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Submitted</th>
                <th>Answer</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => {
                const submittedAnswer = submittedMap[player.id]
                const hasSubmitted = Boolean(submittedAnswer)

                return (
                  <tr key={player.id}>
                    <td>{player.nickname}</td>
                    <td>{hasSubmitted ? 'Yes' : 'No'}</td>
                    <td>
                      {roomStatus === 'reveal' || roomStatus === 'finished'
                        ? (submittedAnswer || '—')
                        : (hasSubmitted ? 'Hidden' : 'Waiting')}
                    </td>
                  </tr>
                )}
              )}
            </tbody>
          </table>
        )}
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
              <div key={answer}>{answer}: {count}</div>
            ))}
          </>
        )}
      </div>

      {isGameFinished && (
        <div className="card" style={{ background: '#fffaf3', borderColor: '#fcd34d' }}>
          <h2>🏆 Game Winner</h2>
          {winnerNames.length === 1 ? (
            <p>
              <strong>{winnerNames[0]}</strong> wins with <strong>{highestScore}</strong> point{highestScore === 1 ? '' : 's'}!
            </p>
          ) : (
            <p>
              <strong>Tie:</strong> {winnerNames.join(' / ')} with <strong>{highestScore}</strong> point{highestScore === 1 ? '' : 's'} each.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Live Staircase Leaderboard</h2>
        {sortedPlayers.length === 0 ? (
          <p>No players joined this room yet.</p>
        ) : (
          <div className="stairsHost">
            {sortedPlayers.map(player => {
              const isLeader = player.score === highestScore && highestScore > 0
              return (
                <div key={player.id} className={`lane ${isLeader ? 'leader' : ''}`}>
                  <div className="label">{player.nickname} ({player.score})</div>
                  <div className="steps">
                    {Array.from({ length: Math.max(questionCount, 1) }).map((_, i) => {
                      const on = i < player.score
                      const showToken = on && i === player.score - 1

                      return (
                        <div key={i} className={`step ${on ? 'on' : ''}`}>
                          {showToken && (
                            <div className="token">
                              {player.nickname.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
