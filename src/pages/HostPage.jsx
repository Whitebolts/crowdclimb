
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function generateRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function naturalNameCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
 
function getTokenLabel(nickname) {
  const clean = String(nickname || '').trim()
  if (!clean) return '?'
  return clean.slice(0, 2).toUpperCase()
}
 
export default function HostPage() {
  const [roomCode, setRoomCode] = useState(generateRoomCode())
  const [roomId, setRoomId] = useState(null)
  const [players, setPlayers] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const importFileRef = useRef(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [currentQuestionText, setCurrentQuestionText] = useState('')
  const [roomStatus, setRoomStatus] = useState('lobby')
  const [revealResult, setRevealResult] = useState(null)
  const [submissions, setSubmissions] = useState([])

  const [draftQuestion, setDraftQuestion] = useState('')
  const [draftAnswers, setDraftAnswers] = useState(['', '', '', ''])
  const [customQuestions, setCustomQuestions] = useState(() => {
  try {
    const savedQuestions = localStorage.getItem('crowdClimbQuestionBank')
    return savedQuestions ? JSON.parse(savedQuestions) : []
  } catch (error) {
    console.error('Could not load saved question bank:', error)
    return []
  }
})
  const [showQuestionBuilder, setShowQuestionBuilder] = useState(true)
  const [editingIndex, setEditingIndex] = useState(null)
  
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

    const current = questions.find(q => q.question_order === room.current_question)
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
    const interval = setInterval(runRefresh, 2000)
    return () => clearInterval(interval)
  }, [roomId, currentQuestion])

  const resetDraft = () => {
    setDraftQuestion('')
    setDraftAnswers(['', '', '', ''])
    setEditingIndex(null)
  }
const clearQuestionBank = () => {
  const confirmed = window.confirm(
    'Clear the saved question bank from this browser? This will not affect exported JSON files.'
  )

  if (!confirmed) return

  setCustomQuestions([])
  resetDraft()
  localStorage.removeItem('crowdClimbQuestionBank')
}
  
  useEffect(() => {
  try {
    localStorage.setItem(
      'crowdClimbQuestionBank',
      JSON.stringify(customQuestions)
    )
  } catch (error) {
    console.error('Could not save question bank:', error)
  }
}, [customQuestions])
  
  const addOrSaveQuestionDraft = () => {
    const prompt = draftQuestion.trim()
    const answers = draftAnswers.map(a => a.trim()).filter(Boolean)

    if (!prompt || answers.length < 2 || answers.length > 4) {
      alert('Enter a question and between 2 and 4 answers.')
      return
    }

    const questionPayload = {
      question_text: prompt,
      answers
    }

    if (editingIndex === null) {
      setCustomQuestions(prev => [...prev, questionPayload])
    } else {
      setCustomQuestions(prev =>
        prev.map((q, i) => (i === editingIndex ? questionPayload : q))
      )
    }

    resetDraft()
  }

  const exportQuestions = () => {
  if (customQuestions.length === 0) {
    alert('There are no custom questions to export.')
    return
  }

  const exportPayload = {
    app: 'Crowd Climb',
    exported_at: new Date().toISOString(),
    question_count: customQuestions.length,
    questions: customQuestions.map((q, index) => ({
      question_order: index,
      question_text: q.question_text,
      answers: q.answers
    }))
  }

  const blob = new Blob(
    [JSON.stringify(exportPayload, null, 2)],
    { type: 'application/json' }
  )

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)

  link.href = url
  link.download = `crowd-climb-questions-${date}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const normalizeImportedQuestions = (rawQuestions) => {
  if (!Array.isArray(rawQuestions)) {
    throw new Error('The file does not contain a questions list.')
  }

  const normalized = rawQuestions.map((q, index) => {
    const questionText =
      typeof q.question_text === 'string'
        ? q.question_text.trim()
        : typeof q.q === 'string'
          ? q.q.trim()
          : ''

    const answersSource = Array.isArray(q.answers)
      ? q.answers
      : Array.isArray(q.a)
        ? q.a
        : []

    const answers = answersSource
      .map(answer => String(answer).trim())
      .filter(Boolean)

    if (!questionText) {
      throw new Error(`Question ${index + 1} is missing question text.`)
    }

    if (answers.length < 2 || answers.length > 4) {
      throw new Error(`Question ${index + 1} must have between 2 and 4 answers.`)
    }

    return {
      question_text: questionText,
      answers
    }
  })

  if (normalized.length === 0) {
    throw new Error('The file does not contain any questions.')
  }

  return normalized
}

const importQuestionsFromFile = (event) => {
  const file = event.target.files?.[0]

  if (!file) return

  const reader = new FileReader()

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result)

      const rawQuestions = Array.isArray(parsed)
        ? parsed
        : parsed.questions

      const importedQuestions = normalizeImportedQuestions(rawQuestions)

      const confirmed = window.confirm(
        `Import ${importedQuestions.length} question${importedQuestions.length === 1 ? '' : 's'} and replace the current question set?`
      )

      if (!confirmed) return

      setCustomQuestions(importedQuestions)
      resetDraft()
      setShowQuestionBuilder(true)

      alert(`Imported ${importedQuestions.length} question${importedQuestions.length === 1 ? '' : 's'}.`)
    } catch (error) {
      console.error('Question import error:', error)
      alert(`Could not import questions: ${error.message}`)
    } finally {
      event.target.value = ''
    }
  }

  reader.onerror = () => {
    alert('Could not read the selected file.')
    event.target.value = ''
  }

  reader.readAsText(file)
}

const openImportQuestionsPicker = () => {
  importFileRef.current?.click()
}
  
  const beginEditQuestion = (index) => {
    const q = customQuestions[index]
    const paddedAnswers = [...q.answers]

    while (paddedAnswers.length < 4) {
      paddedAnswers.push('')
    }

    setDraftQuestion(q.question_text)
    setDraftAnswers(paddedAnswers)
    setEditingIndex(index)
    setShowQuestionBuilder(true)
  }

  const removeQuestion = (index) => {
    setCustomQuestions(prev => prev.filter((_, i) => i !== index))

    if (editingIndex === index) {
      resetDraft()
      return
    }

    if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1)
    }
  }

  const moveQuestionUp = (index) => {
    if (index === 0) return

    setCustomQuestions(prev => {
      const updated = [...prev]
      ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
      return updated
    })

    if (editingIndex === index) {
      setEditingIndex(index - 1)
    } else if (editingIndex === index - 1) {
      setEditingIndex(index)
    }
  }

  const moveQuestionDown = (index) => {
    if (index === customQuestions.length - 1) return

    setCustomQuestions(prev => {
      const updated = [...prev]
      ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
      return updated
    })

    if (editingIndex === index) {
      setEditingIndex(index + 1)
    } else if (editingIndex === index + 1) {
      setEditingIndex(index)
    }
  }

  const seedRoomWithCurrentQuestions = async (targetRoomId) => {
    if (customQuestions.length === 0) {
      alert('Add at least one custom question before starting or restarting the game.')
      return false
    }

    const { error: deleteSubmissionsError } = await supabase
      .from('submissions')
      .delete()
      .eq('room_id', targetRoomId)

    if (deleteSubmissionsError) {
      console.error('Submissions delete error:', deleteSubmissionsError)
      alert(`Could not clear previous submissions: ${deleteSubmissionsError.message}`)
      return false
    }

    const { error: deleteQuestionsError } = await supabase
      .from('questions')
      .delete()
      .eq('room_id', targetRoomId)

    if (deleteQuestionsError) {
      console.error('Question delete error:', deleteQuestionsError)
      alert(`Could not reset previous questions: ${deleteQuestionsError.message}`)
      return false
    }

    for (let i = 0; i < customQuestions.length; i++) {
      const q = customQuestions[i]

      const { data: insertedQuestion, error: questionError } = await supabase
        .from('questions')
        .insert({
          room_id: targetRoomId,
          question_text: q.question_text,
          question_order: i
        })
        .select()
        .single()

      if (questionError) {
        console.error('Question insert error:', questionError)
        alert(`Question insert error: ${questionError.message}`)
        return false
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
        return false
      }
    }

    return true
  }

  const resetScoresForRoom = async (targetRoomId) => {
    const { data: roomPlayers, error: roomPlayersError } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', targetRoomId)

    if (roomPlayersError) {
      console.error('Players lookup error:', roomPlayersError)
      alert(`Could not reset player scores: ${roomPlayersError.message}`)
      return false
    }

    for (const player of roomPlayers || []) {
      const { error: scoreResetError } = await supabase
        .from('players')
        .update({ score: 0 })
        .eq('id', player.id)

      if (scoreResetError) {
        console.error('Score reset error:', scoreResetError)
        alert(`Could not reset player scores: ${scoreResetError.message}`)
        return false
      }
    }

    return true
  }

  const createFreshRoom = async (newCode) => {
    const { data: createdRoom, error: insertRoomError } = await supabase
      .from('rooms')
      .insert({
        room_code: newCode,
        status: 'question',
        current_question: 0
      })
      .select()
      .single()

    if (insertRoomError) {
      console.error('Room insert error:', insertRoomError)
      alert(`Could not create room: ${insertRoomError.message}`)
      return null
    }

    return createdRoom.id
  }

  const startGame = async () => {
    if (customQuestions.length === 0) {
      alert('Add at least one custom question before starting the game.')
      return
    }

    let currentRoomId = roomId

    if (!currentRoomId) {
      currentRoomId = await createFreshRoom(roomCode)
      if (!currentRoomId) return
      setRoomId(currentRoomId)
    } else {
      const { error: updateRoomError } = await supabase
        .from('rooms')
        .update({ status: 'question', current_question: 0 })
        .eq('id', currentRoomId)

      if (updateRoomError) {
        console.error('Room update error:', updateRoomError)
        alert(`Could not start game: ${updateRoomError.message}`)
        return
      }
    }

    const scoresReset = await resetScoresForRoom(currentRoomId)
    if (!scoresReset) return

    const seeded = await seedRoomWithCurrentQuestions(currentRoomId)
    if (!seeded) return

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
      .select('id')
      .eq('room_id', roomId)
      .eq('question_order', room.current_question)
      .maybeSingle()

    if (questionError || !questionRow) {
      alert(questionError ? `Could not load question: ${questionError.message}` : 'No question found')
      return
    }

    const { data: currentSubmissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('player_id, nickname, answer')
      .eq('room_id', roomId)
      .eq('question_id', questionRow.id)

    if (submissionsError) {
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
    const winningAnswers = Object.keys(counts).filter(answer => counts[answer] === max)
    const winningPlayerIds = currentSubmissions
      .filter(sub => winningAnswers.includes(sub.answer))
      .map(sub => sub.player_id)

    const { data: currentPlayers, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)

    if (playersError) {
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
      alert(`Could not update room status: ${roomUpdateError.message}`)
      return
    }

    setRevealResult({ winningAnswers, counts, winningPlayerIds })
    setSubmissions(currentSubmissions)
    await fetchPlayers(roomId)
    await fetchRoomState(roomId)
  }

  const restartGame = async () => {
    if (customQuestions.length === 0) {
      alert('Add at least one custom question before restarting the game.')
      return
    }

    const newCode = generateRoomCode()
    const newRoomId = await createFreshRoom(newCode)
    if (!newRoomId) return

    const seeded = await seedRoomWithCurrentQuestions(newRoomId)
    if (!seeded) return

    setRoomCode(newCode)
    setRoomId(newRoomId)
    setPlayers([])
    setRevealResult(null)
    setSubmissions([])
    setShowQuestionBuilder(false)
    setCurrentQuestion(0)
    setRoomStatus('question')

    await fetchRoomState(newRoomId)
    await fetchSubmissions(newRoomId, 0)

    alert(`Game restarted with a new room code: ${newCode}. Players will need to rejoin.`)
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
      alert(`Could not load room state: ${roomError.message}`)
      return
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, question_order')
      .eq('room_id', roomId)
      .order('question_order', { ascending: true })

    if (questionsError) {
      alert(`Could not load questions: ${questionsError.message}`)
      return
    }

    const nextIndex = room.current_question + 1
    if (nextIndex >= questions.length) {
      alert('No more questions in this room')
      return
    }

    const { error: updateError } = await supabase
      .from('rooms')
      .update({ current_question: nextIndex, status: 'question' })
      .eq('id', roomId)

    if (updateError) {
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
    return naturalNameCompare(a.nickname, b.nickname)
  })

  const highestScore =
    sortedPlayers.length > 0 ? Math.max(...sortedPlayers.map(p => p.score)) : 0

  const winnerNames = sortedPlayers
    .filter(player => player.score === highestScore)
    .map(player => player.nickname)

  const submittedMap = {}
  submissions.forEach(sub => {
    if (sub.player_id) submittedMap[sub.player_id] = sub.answer
  })

  const submittedCount = players.filter(player => Boolean(submittedMap[player.id])).length
  const totalPlayers = players.length

  const isGameFinished = roomStatus === 'finished' && questionCount > 0

 const mountainPositions = useMemo(() => {
  const maxScore = Math.max(questionCount, 1)
  const grouped = new Map()

  sortedPlayers.forEach(player => {
    const bucket = grouped.get(player.score) || []
    bucket.push(player)
    grouped.set(player.score, bucket)
  })

  const byId = {}

  grouped.forEach((bandPlayers, bandScore) => {
    const progress = Math.min(Math.max(bandScore / maxScore, 0), 1)

    // Score 0 sits on the lower mountain/base area.
    // Full score reaches near the central summit.
    const y = 76 - progress * 58

    // Players spread widely at the base and converge near the summit.
    let bandWidth = 84 - progress * 68

    if (bandPlayers.length === 1) {
      byId[bandPlayers[0].id] = { x: 50, y }
      return
    }

    if (progress >= 0.95) {
      bandWidth = Math.min(bandWidth, 16)
    }

    const startX = 50 - bandWidth / 2
    const step = bandPlayers.length > 1 ? bandWidth / (bandPlayers.length - 1) : 0

    bandPlayers.forEach((player, idx) => {
      byId[player.id] = {
        x: startX + step * idx,
        y
      }
    })
  })

  return byId
}, [sortedPlayers, questionCount])


  return (
    <div className="hostScreen">
      <div className="hostOverlay" />

      <div className="hostContent container">
        <div className="card hostHeroCard">
          <img
            src="/crowd-climb-logo.svg"
            alt="Crowd Climb"
            className="hostLogo"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />

          <h2 className="hostRoomCode">Room Code: {roomCode}</h2>

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
<button style={{ marginLeft: 10 }} onClick={clearQuestionBank}>
  Clear Question Bank
</button>
          <button style={{ marginLeft: 10 }} onClick={exportQuestions}>
  Export Questions
</button>

          
<button style={{ marginLeft: 10 }} onClick={openImportQuestionsPicker}>
  Import Questions
</button>

<input
  ref={importFileRef}
  type="file"
  accept="application/json,.json"
  style={{ display: 'none' }}
  onChange={importQuestionsFromFile}
/>

          
        </div>

        
        {showQuestionBuilder && (
          <div className="card">
            <h2>Question Builder</h2>
            <p>
              Add your own room questions below. At least one custom question is required.
            </p>

            <p>
              <strong>
                {editingIndex === null
                  ? 'Adding a new question'
                  : `Editing question ${editingIndex + 1}`}
              </strong>
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

            <button onClick={addOrSaveQuestionDraft}>
              {editingIndex === null ? 'Add Question' : 'Save Changes'}
            </button>

            {editingIndex !== null && (
              <button
                style={{ marginLeft: 10 }}
                onClick={resetDraft}
              >
                Cancel Edit
              </button>
            )}

            <div style={{ marginTop: 16 }}>
              <strong>Question Set For This Room</strong>
              {customQuestions.length === 0 ? (
                <p style={{ marginTop: 12 }}>No custom questions added yet.</p>
              ) : (
                customQuestions.map((q, index) => (
                  <div
                    key={index}
                    className="card"
                    style={{ marginTop: 12, marginBottom: 0, padding: 14 }}
                  >
                    <div><strong>{index + 1}. {q.question_text}</strong></div>
                    <div style={{ marginTop: 8 }}>{q.answers.join(' • ')}</div>

                    <button
                      style={{ marginTop: 10 }}
                      onClick={() => beginEditQuestion(index)}
                    >
                      Edit
                    </button>

                    <button
                      style={{ marginTop: 10, marginLeft: 10 }}
                      onClick={() => moveQuestionUp(index)}
                      disabled={index === 0}
                    >
                      Move Up
                    </button>

                    <button
                      style={{ marginTop: 10, marginLeft: 10 }}
                      onClick={() => moveQuestionDown(index)}
                      disabled={index === customQuestions.length - 1}
                    >
                      Move Down
                    </button>

                    <button
                      style={{ marginTop: 10, marginLeft: 10 }}
                      onClick={() => removeQuestion(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="card">
          <h2>Current Question</h2>
          <p>Question {questionCount === 0 ? 0 : currentQuestion + 1} / {questionCount}</p>
          <p><strong>Submissions:</strong> {submittedCount} / {totalPlayers}</p>
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
                <div key={answer}>{answer}: {count}</div>
              ))}
            </>
          )}
        </div>

        {isGameFinished && (
          <div className="card" style={{ background: 'rgba(255, 250, 243, 0.86)', borderColor: '#fcd34d' }}>
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
  <div className="mountainLeaderboardHeader">
    <div>
      <h2>Submission Status ({submittedCount} / {totalPlayers})</h2>
      <p style={{ marginTop: 0, color: '#475569' }}>
        Mountain Leaderboard
      </p>
    </div>

    <div className="mountainLeaderboardControls">
      <button onClick={reveal}>
        Reveal
      </button>

      <button
        onClick={nextQuestion}
        disabled={roomStatus !== 'reveal'}
      >
        Next Question
      </button>
    </div>
  </div>

  {sortedPlayers.length === 0 ? (
            <p>No players joined this room yet.</p>
          ) : (
            <div
              style={{
  position: 'relative',
  minHeight: 560,
  marginTop: 12,
  borderRadius: 20,
  overflow: 'hidden',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 100%)'
}}
            >
             <img
  src="/crowdclimb-mountain-board.png"
  alt="Mountain leaderboard"
  onError={(e) => {
    e.currentTarget.style.display = 'none'
  }}
  style={{
    position: 'absolute',
    left: '50%',
    top: 20,
    transform: 'translateX(-50%)',
    width: 'min(100%, 1100px)',
    height: '78%',
    objectFit: 'contain',
    opacity: 0.98,
    pointerEvents: 'none'
  }}
/>

              <div style={{ position: 'absolute', inset: 0 }}>
                {sortedPlayers.map(player => {
                  const pos = mountainPositions[player.id] || { x: 50, y: 76 }
                  const isLeader = player.score === highestScore && highestScore > 0

                  return (
                    <div
  key={player.id}
  className="mountainTokenWrap"
  style={{
    position: 'absolute',
    left: `${pos.x}%`,
    top: `${pos.y}%`,
    transform: 'translate(-50%, -50%)',
    transition: 'left 0.6s ease, top 0.6s ease, transform 0.25s ease',
    zIndex: isLeader ? 3 : 2
  }}
>
  <div
    className={`mountainToken ${isLeader ? 'mountainTokenLeader' : ''}`}
  >
    {getTokenLabel(player.nickname)}
  </div>

  <div className="mountainTokenTooltip">
    {player.nickname} ({player.score})
  </div>
</div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
