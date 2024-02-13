import z from "zod"
import { prisma } from "../../lib/prisma"
import { FastifyInstance } from "fastify"
import { randomUUID } from "node:crypto"
import { redis } from "../../lib/redis"
import { voting } from "../../utils/voting-pub-sub"

export async function voteOnPoll(app: FastifyInstance){
    app.post('/polls/:pollId/votes', async (req,reply)=>{


        const voteOnPollBody = z.object({
            pollOptionId: z.string().uuid(),
        })
        const voteOnPollParams = z.object({
            pollId: z.string().uuid(),
        })
    
    
    
        const { pollOptionId } = voteOnPollBody.parse(req.body)
        const { pollId } = voteOnPollParams.parse(req.params)

        let { sessionId } = req.cookies
        
        
        if(sessionId) {
            const userPreviusVoteOnPoll = await prisma.vote.findUnique({
                where: {
                    sessionId_pollId: {
                        sessionId,
                        pollId
                    }
                }
            })
            if (userPreviusVoteOnPoll && userPreviusVoteOnPoll.pollOptionId !== pollOptionId){
                // Delete the previous vote
                await prisma.vote.delete({
                    where: {
                        id: userPreviusVoteOnPoll.id
                    }
                })
                const votes = await redis.zincrby(pollId,-1,userPreviusVoteOnPoll.pollOptionId)

                voting.publish(pollId, {
                    pollOptionId: userPreviusVoteOnPoll.pollOptionId,
                    votes: Number(votes),
                })
            } else if(userPreviusVoteOnPoll){
                return reply.status(400).send({ menssage: "You already vote on this poll." })
            }
        }

        


        if(!sessionId){
            sessionId = randomUUID()
      
            reply.setCookie('sessionId',sessionId,{
                path: '/',
                maxAge: 60 * 60 * 24 * 30, // 30 days
                signed: true,
                httpOnly: true,
            })
        }
        
        await prisma.vote.create({
            data:{
                sessionId,
                pollId,
                pollOptionId
            }
        })
        
        const votes = await redis.zincrby(pollId,1,pollOptionId)


        voting.publish(pollId, {
            pollOptionId,
            votes: Number(votes),
        })

        return reply.status(201).send()
    })
}