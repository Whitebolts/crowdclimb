
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function naturalNameCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

function getTokenLabel(nickname) {
  const clean = String(nickname || '').trim()
  if (!clean) return '?'
  return clean.slice(0, 2).toUpperCase()
}
 
export default function PlayerPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()

  const [question, setQuestion] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [currentQuestionId, setCurrentQuestionId] = useState(null)
  const [roomStatus, setRoomStatus] = useState('lobby')
  const [players, setPlayers] = useState([])
  const [questionCount, setQuestionCount] = useState(0)

  const fetchPlayerLeaderboard = async (targetRoomId) => {
    if (!targetRoomId) return

    const { data: roomPlayers, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', targetRoomId)
      .order('created_at', { ascending: true })

    if (playersError) {
      console.error('Player leaderboard fetch error:', playersError)
      return
    }

    setPlayers(roomPlayers || [])

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id')
      .eq('room_id', targetRoomId)

    if (questionsError) {
      console.error('Question count fetch error:', questionsError)
      return
    }

    setQuestionCount((questions || []).length)
  }

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
    await fetchPlayerLeaderboard(room.id)

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

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return naturalNameCompare(a.nickname, b.nickname)
    })
  }, [players])

  const highestScore =
    sortedPlayers.length > 0 ? Math.max(...sortedPlayers.map(p => p.score)) : 0

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
      const y = 82 - progress * 68
      let bandWidth = 70 - progress * 56

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

  const MountainLeaderboard = () => {
    if (sortedPlayers.length === 0) return null

    return (
      <div className="playerMountainCard">
        <h3>Mountain Leaderboard</h3>
        <p>Watch everyone climb toward the summit.</p>

        <div className="playerMountainBoard">
          <img
            src="/crowdclimb_bg_night.png"
            alt="Mountain leaderboard"
            className="playerMountainImage"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />

          <div className="playerMountainTokenLayer">
            {sortedPlayers.map(player => {
              const pos = mountainPositions[player.id] || { x: 50, y: 82 }
              const isLeader = player.score === highestScore && highestScore > 0
              const isCurrentPlayer = player.id === localStorage.getItem('playerId')

              return (
                <div
                  key={player.id}
                  className="mountainTokenWrap playerMountainTokenWrap"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    zIndex: isLeader ? 4 : isCurrentPlayer ? 3 : 2
                  }}
                >
                  <div
                    className={`mountainToken playerMountainToken ${isLeader ? 'mountainTokenLeader' : ''} ${isCurrentPlayer ? 'playerMountainTokenCurrent' : ''}`}
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
      </div>
    )
  }

  if (roomStatus === 'finished') {
    return (
      <div className="playerScreen">
        <div className="playerOverlay" />
        <div className="playerShell playerCenteredShell playerGameShell">
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

          <MountainLeaderboard />
        </div>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="playerScreen">
        <div className="playerOverlay" />
        <div className="playerShell playerCenteredShell playerGameShell">
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

          <MountainLeaderboard />
        </div>
      </div>
    )
  }

  return (
    <div className="playerScreen">
      <div className="playerOverlay" />
      <div className="playerShell playerCenteredShell playerGameShell">
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

        <MountainLeaderboard />
      </div>
    </div>
  )
}
