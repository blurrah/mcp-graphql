import { makeExecutableSchema } from "@graphql-tools/schema";
import { createYoga } from "graphql-yoga";
import fs from "node:fs";

/**
 * Simple GraphQL server implementation for testing purposes
 *
 * This is a simple GraphQL server implementation for testing purposes.
 * It is not intended to be used in production.
 *
 * It is used to test the GraphQL schema and resolvers.
 *
 */

// Define types
interface User {
	id: string;
	name: string;
	email: string;
	createdAt: string;
	updatedAt: string | null;
}

interface Post {
	id: string;
	title: string;
	content: string;
	published: boolean;
	authorId: string;
	createdAt: string;
	updatedAt: string | null;
}

interface Comment {
	id: string;
	text: string;
	postId: string;
	authorId: string;
	createdAt: string;
}

interface CreateUserInput {
	name: string;
	email: string;
}

interface UpdateUserInput {
	name?: string;
	email?: string;
}

interface CreatePostInput {
	title: string;
	content: string;
	published?: boolean;
	authorId: string;
}

interface AddCommentInput {
	text: string;
	postId: string;
	authorId: string;
}

// Define resolver context type
type ResolverContext = Record<string, never>;

// Read schema from file
const typeDefs = fs.readFileSync("./schema-simple.graphql", "utf-8");

// Create mock data
const users: User[] = [
	{
		id: "1",
		name: "John Doe",
		email: "john@example.com",
		createdAt: new Date().toISOString(),
		updatedAt: null,
	},
	{
		id: "2",
		name: "Jane Smith",
		email: "jane@example.com",
		createdAt: new Date().toISOString(),
		updatedAt: null,
	},
	{
		id: "3",
		name: "Bob Johnson",
		email: "bob@example.com",
		createdAt: new Date().toISOString(),
		updatedAt: null,
	},
];

const posts: Post[] = [
	{
		id: "1",
		title: "First Post",
		content: "This is my first post",
		published: true,
		authorId: "1",
		createdAt: new Date().toISOString(),
		updatedAt: null,
	},
	{
		id: "2",
		title: "GraphQL is Awesome",
		content: "Here is why GraphQL is better than REST",
		published: true,
		authorId: "1",
		createdAt: new Date().toISOString(),
		updatedAt: null,
	},
	{
		id: "3",
		title: "Yoga Tutorial",
		content: "Learn how to use GraphQL Yoga",
		published: false,
		authorId: "2",
		createdAt: new Date().toISOString(),
		updatedAt: null,
	},
];

const comments: Comment[] = [
	{
		id: "1",
		text: "Great post!",
		postId: "1",
		authorId: "2",
		createdAt: new Date().toISOString(),
	},
	{
		id: "2",
		text: "I learned a lot",
		postId: "1",
		authorId: "3",
		createdAt: new Date().toISOString(),
	},
	{
		id: "3",
		text: "Looking forward to more content",
		postId: "2",
		authorId: "2",
		createdAt: new Date().toISOString(),
	},
];

// Define resolvers
const resolvers = {
	Query: {
		user: (
			_parent: unknown,
			{ id }: { id: string },
			_context: ResolverContext,
		) => users.find((user) => user.id === id),
		users: () => users,
		post: (
			_parent: unknown,
			{ id }: { id: string },
			_context: ResolverContext,
		) => posts.find((post) => post.id === id),
		posts: () => posts,
		commentsByPost: (
			_parent: unknown,
			{ postId }: { postId: string },
			_context: ResolverContext,
		) => comments.filter((comment) => comment.postId === postId),
	},
	Mutation: {
		createUser: (
			_parent: unknown,
			{ input }: { input: CreateUserInput },
			_context: ResolverContext,
		) => {
			const newUser: User = {
				id: String(users.length + 1),
				name: input.name,
				email: input.email,
				createdAt: new Date().toISOString(),
				updatedAt: null,
			};
			users.push(newUser);
			return newUser;
		},
		updateUser: (
			_parent: unknown,
			{ id, input }: { id: string; input: UpdateUserInput },
			_context: ResolverContext,
		) => {
			const userIndex = users.findIndex((user) => user.id === id);
			if (userIndex === -1) throw new Error(`User with ID ${id} not found`);

			users[userIndex] = {
				...users[userIndex],
				...input,
				updatedAt: new Date().toISOString(),
			};

			return users[userIndex];
		},
		deleteUser: (
			_parent: unknown,
			{ id }: { id: string },
			_context: ResolverContext,
		) => {
			const userIndex = users.findIndex((user) => user.id === id);
			if (userIndex === -1) return false;

			users.splice(userIndex, 1);
			return true;
		},
		createPost: (
			_parent: unknown,
			{ input }: { input: CreatePostInput },
			_context: ResolverContext,
		) => {
			const newPost: Post = {
				id: String(posts.length + 1),
				title: input.title,
				content: input.content,
				published: input.published ?? false,
				authorId: input.authorId,
				createdAt: new Date().toISOString(),
				updatedAt: null,
			};
			posts.push(newPost);
			return newPost;
		},
		addComment: (
			_parent: unknown,
			{ input }: { input: AddCommentInput },
			_context: ResolverContext,
		) => {
			const newComment: Comment = {
				id: String(comments.length + 1),
				text: input.text,
				postId: input.postId,
				authorId: input.authorId,
				createdAt: new Date().toISOString(),
			};
			comments.push(newComment);
			return newComment;
		},
	},
	User: {
		posts: (parent: User) =>
			posts.filter((post) => post.authorId === parent.id),
		comments: (parent: User) =>
			comments.filter((comment) => comment.authorId === parent.id),
	},
	Post: {
		author: (parent: Post) => users.find((user) => user.id === parent.authorId),
		comments: (parent: Post) =>
			comments.filter((comment) => comment.postId === parent.id),
	},
	Comment: {
		post: (parent: Comment) => posts.find((post) => post.id === parent.postId),
		author: (parent: Comment) =>
			users.find((user) => user.id === parent.authorId),
	},
};

// Create executable schema
const schema = makeExecutableSchema({
	typeDefs,
	resolvers,
});

// Create Yoga instance
const yoga = createYoga({ schema });

// Start server with proper request handler
const server = Bun.serve({
	port: 4000,
	fetch: (request) => {
		// Add dev logger for incoming requests
		console.log(
			`[${new Date().toISOString()}] Incoming request: ${request.method} ${
				request.url
			}`,
		);
		return yoga.fetch(request);
	},
});

console.info(
	`GraphQL server is running on ${new URL(
		yoga.graphqlEndpoint,
		`http://${server.hostname}:${server.port}`,
	)}`,
);
