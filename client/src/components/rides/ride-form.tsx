import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, Plus, Minus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { insertRideSchema, transportType } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";

export function RideForm({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast();
  const [stopPoints, setStopPoints] = useState<string[]>([]);

  const form = useForm({
    resolver: zodResolver(insertRideSchema),
    defaultValues: {
      origin: "",
      destination: "",
      stopPoints: [],
      departureTime: new Date(),
      transportType: "PERSONAL",
      seatsAvailable: 3,
    },
  });

  async function onSubmit(values: any) {
    try {
      const cleanedStopPoints = stopPoints.filter(point => point.trim() !== "");

      await apiRequest("POST", "/api/rides", {
        ...values,
        stopPoints: cleanedStopPoints,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      toast({ title: "Success", description: "Ride created successfully" });
      onSuccess?.();
      form.reset();
      setStopPoints([]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create ride",
        variant: "destructive",
      });
    }
  }

  const addStopPoint = () => {
    if (stopPoints.length < 3) {
      setStopPoints([...stopPoints, ""]);
    }
  };

  const removeStopPoint = (index: number) => {
    setStopPoints(stopPoints.filter((_, i) => i !== index));
  };

  const updateStopPoint = (index: number, value: string) => {
    const newStopPoints = [...stopPoints];
    newStopPoints[index] = value;
    setStopPoints(newStopPoints);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="origin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pickup Location</FormLabel>
              <FormControl>
                <Input placeholder="Enter pickup location" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <FormLabel>Stop Points (max 3)</FormLabel>
            {stopPoints.length < 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStopPoint}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stop
              </Button>
            )}
          </div>
          {stopPoints.map((stop, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder={`Stop ${index + 1}`}
                value={stop}
                onChange={(e) => updateStopPoint(index, e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeStopPoint(index)}
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <FormField
          control={form.control}
          name="destination"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination</FormLabel>
              <FormControl>
                <Input placeholder="Enter destination" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="departureTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Departure Time</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP p")
                      ) : (
                        <span>Pick a date and time</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={(date) => {
                      if (date) {
                        const currentTime = field.value;
                        date.setHours(currentTime.getHours());
                        date.setMinutes(currentTime.getMinutes());
                        field.onChange(date);
                      }
                    }}
                    initialFocus
                  />
                  <div className="p-3 border-t">
                    <Input
                      type="time"
                      onChange={(e) => {
                        const [hours, minutes] = e.target.value.split(':');
                        const date = new Date(field.value);
                        date.setHours(parseInt(hours));
                        date.setMinutes(parseInt(minutes));
                        field.onChange(date);
                      }}
                      value={format(field.value, "HH:mm")}
                    />
                  </div>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="transportType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Transport Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select transport type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {transportType.options.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="seatsAvailable"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Available Seats</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  {...field}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 1 && value <= 6) {
                      field.onChange(value);
                      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full">
          Create Ride
        </Button>
      </form>
    </Form>
  );
}