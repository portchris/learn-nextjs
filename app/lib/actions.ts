'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const FormSchema = z.object({
    id: z.string(),
    date: z.string(),
    amount: z.coerce
        .number()
        .gt(
            0,
            {
                message: 'Please enter an amount greater than $0.'
            }
        )
        .lt(
            99999999,
            {
                message: 'Please enter an amount less than $99999999.'
            }
        ),
    status: z.enum(
        [
            'pending',
            'paid'
        ],
        {
            invalid_type_error: 'Please select an invoice status.',
        }
    ),
    customerId: z.string(
        {
            invalid_type_error: 'Please select a customer.'
        }
    ),
});

const CreateInvoice = FormSchema.omit(
    {
        id: true,
        date: true
    }
);

const UpdateInvoice = FormSchema.omit(
    {
        id: true,
        date: true
    }
);

const DeleteInvoice = FormSchema.omit(
    {
        date: true,
        amount: true,
        status: true,
        customerId: true
    }
);

// This is temporary until @types/react-dom is updated
export type State = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {

    const validatedFields = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    // If form validation fails, return errors early. Otherwise, continue.
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Create Invoice.',
        };
    }

    // Prepare data for insertion into the database
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    try {
        await sql`
            INSERT INTO invoices (customer_id, amount, status, date)
            VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
    } catch (error) {

        console.error(error);
        return {
            message: 'Database Error: Failed to Create Invoice.'
        };
    }

    /**
     * Next.js has a Client-side Router Cache that stores the route segments in the user's browser for a time.
     * Along with prefetching, this cache ensures that users can quickly navigate between routes while reducing the number of requests made to the server.
     * Since you're updating the data displayed in the invoices route, you want to clear this cache and trigger a new request to the server.
     * You can do this with the revalidatePath function from Next.js:
     */
    revalidatePath('/dashboard/invoices');

    /**
     * Once the database has been updated, the /dashboard/invoices path will be revalidated, and fresh data will be fetched from the server.
     * At this point, you also want to redirect the user back to the /dashboard/invoices page. You can do this with the redirect function from Next.js:
     */
    redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, prevState: State, formData: FormData) {

    const validatedFields = UpdateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status')
    });

    // If form validation fails, return errors early. Otherwise, continue.
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Update Invoice.',
        };
    }

    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;

    try {
        await sql`
            UPDATE invoices
            SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
            WHERE id = ${id}
        `;
    } catch (error) {

        console.error(error);
        return {
            message: 'Database Error: Failed to Update Invoice.'
        }
    }

    /**
     * See reference above regarding revalidatePath
     */
    revalidatePath('/dashboard/invoices');

    /**
     * See reference above regarding redirect
     */
    redirect('/dashboard/invoices');
}

export async function deleteInvoice(uuid: string, formData: FormData) {

    // throw new Error('FAIL!!!');

    const { id } = DeleteInvoice.parse({
        id: uuid
    });

    try {
        await sql`
            DELETE FROM invoices WHERE id = ${id}
        `;

        /**
         * See reference above regarding revalidatePath
         */
        revalidatePath('/dashboard/invoices');
        return {
            message: 'Deleted Invoice.'
        };
    } catch (error) {

        console.error(error);
        return {
            message: 'Database Error: Failed to Delete Invoice.'
        };
    }
}

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}