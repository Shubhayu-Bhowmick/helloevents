import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { createUser, deleteUser, updateUser } from '@/lib/actions/user.actions'
import { clerkClient } from '@clerk/nextjs'
import { NextResponse } from 'next/server'
import { DatabaseError } from '@/lib/database'

class WebhookError extends Error {
  readonly code: number
  constructor(message: string) {
    super(message)
    this.name = "WebhookError"
    this.code = 400
  }
}

async function verifyWebhook(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new WebhookError('Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local')
  }

  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    throw new WebhookError('Error occured -- no svix headers')
  }

  const payload = await req.json()
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);

  try {
    return wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent
  } catch (err) {

    throw new WebhookError('Error occurred verifying webhook')
  }
}

export async function POST(req: Request) {
  try {
    const evt = await verifyWebhook(req);
    const eventType = evt.type;

    switch (eventType) {
      case 'user.created': {
        const { id, email_addresses, image_url, first_name, last_name, username } = evt.data;

        const user = {
          clerkId: id,
          email: email_addresses[0].email_address,
          username: username!,
          firstName: first_name,
          lastName: last_name,
          photo: image_url,
        }

        const newUser = await createUser(user);
        console.log(user);
        if (newUser) {
          await clerkClient.users.updateUserMetadata(id, {
            publicMetadata: {
              userId: newUser._id
            }
          })
        }

        return NextResponse.json({ message: 'OK', user: user })
      }
      case 'user.updated': {
        const { id, image_url, first_name, last_name, username } = evt.data

        const user = {
          firstName: first_name,
          lastName: last_name,
          username: username!,
          photo: image_url,
        }

        const updatedUser = await updateUser(id, user)

        return NextResponse.json({ message: 'OK', user: updatedUser })
      }
      case 'user.deleted': {
        const { id } = evt.data

        const deletedUser = await deleteUser(id!)

        return NextResponse.json({ message: 'OK', user: deletedUser })
      }
      default:
        throw new WebhookError('Invalid event type')
    }
  } catch (error) {
    console.error(error);

    if (error instanceof DatabaseError) {
      return NextResponse.json({ code: error.code, message: error.message })
    }

    if (error instanceof WebhookError) {
      return NextResponse.json({ code: error.code, message: error.message })
    }

    return NextResponse.json({ code: 500, message: 'Unexpected Error happened' })
  }
}
