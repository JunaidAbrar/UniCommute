import { useState } from "react";
import { Message } from "@shared/schema";
import { useAuth } from "./use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useChat(rideId: number) {
  const { user } = useAuth();

  // Fetch messages with polling
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [`/api/rides/${rideId}/messages`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/rides/${rideId}/messages`);
      return await res.json();
    },
    refetchInterval: 1000, // Poll every second
  });

  // Mutation for sending messages
  const messageMutation = useMutation({
    mutationFn: async (content: string) => {
      const message = {
        rideId,
        content,
        type: 'text'
      };
      const res = await apiRequest("POST", `/api/rides/${rideId}/messages`, message);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rides/${rideId}/messages`] });
    },
  });

  const sendMessage = (content: string) => {
    if (!user || content.trim() === '') return;
    messageMutation.mutate(content);
  };

  return {
    messages,
    sendMessage,
    isLoading: messageMutation.isPending
  };
}