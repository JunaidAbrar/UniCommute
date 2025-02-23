import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
import { CalendarIcon, Plus, Minus, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { insertRideSchema, transportType } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";

export function RideForm({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [stopPoints, setStopPoints] = useState<string[]>([]);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Handle keyboard visibility and resize
  useEffect(() => {
    const handleResize = () => {
      const isKeyboard = window.innerHeight < window.outerHeight * 0.75;
      setIsKeyboardVisible(isKeyboard);
      setIsMobile(window.innerWidth <= 768);

      // Scroll to focused input when keyboard shows
      const focusedElement = document.activeElement;
      if (isKeyboard && focusedElement instanceof HTMLElement) {
        setTimeout(() => {
          focusedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const form = useForm({
    resolver: zodResolver(insertRideSchema),
    defaultValues: {
      origin: "",
      destination: "",
      stopPoints: [],
      departureTime: new Date(),
      transportType: "PERSONAL",
      seatsAvailable: 3,
      femaleOnly: false,
      estimatedFare: 0
    },
  });

  async function onSubmit(values: any) {
    try {
      const cleanedStopPoints = stopPoints.filter(point => point.trim() !== "");

      const res = await apiRequest("POST", "/api/rides", {
        ...values,
        stopPoints: cleanedStopPoints,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/rides"] });
      toast({ 
        title: "Success", 
        description: "Ride created successfully" 
      });
      onSuccess?.();
      form.reset();
      setStopPoints([]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create ride",
        variant: "destructive",
      });

      if (!(error instanceof Error)) {
        onSuccess?.();
      }
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

  const showFemaleOnlyToggle = user?.gender === 'female';

  const handleSeatChange = (change: number) => {
    const currentValue = form.getValues("seatsAvailable");
    const newValue = Math.min(Math.max(currentValue + change, 1), 6);
    form.setValue("seatsAvailable", newValue);
  };

  return (
    <div className="relative flex flex-col h-full">
      <ScrollArea className="flex-1 px-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-24">
            <FormField
              control={form.control}
              name="origin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pickup Location</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input 
                        type="search"
                        placeholder="Enter pickup location"
                        className="h-12 pl-4 pr-10"
                        autoComplete="street-address"
                        autoCapitalize="words"
                        {...field}
                      />
                      {field.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                          onClick={() => field.onChange("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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
                    className="h-12"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Stop
                  </Button>
                )}
              </div>
              {stopPoints.map((stop, index) => (
                <div key={index} className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="search"
                      placeholder={`Stop ${index + 1}`}
                      value={stop}
                      onChange={(e) => updateStopPoint(index, e.target.value)}
                      className="h-12 pl-4 pr-10"
                      autoComplete="street-address"
                      autoCapitalize="words"
                    />
                    {stop && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                        onClick={() => updateStopPoint(index, "")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeStopPoint(index)}
                    className="h-12 w-12"
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
                    <div className="relative">
                      <Input 
                        type="search"
                        placeholder="Enter destination"
                        className="h-12 pl-4 pr-10"
                        autoComplete="street-address"
                        autoCapitalize="words"
                        {...field}
                      />
                      {field.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                          onClick={() => field.onChange("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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
                            "w-full h-12 pl-4 text-left font-normal",
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
                          className="h-12"
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
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select transport type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {transportType.options.map((type) => (
                        <SelectItem key={type} value={type} className="h-12">
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
                    <div className="flex items-center gap-4">
                      {isMobile ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => handleSeatChange(-1)}
                            disabled={field.value <= 1}
                            className="h-12 w-12"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <div className="flex-1 text-center text-lg font-medium">
                            {field.value}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => handleSeatChange(1)}
                            disabled={field.value >= 6}
                            className="h-12 w-12"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Input
                          type="number"
                          min={1}
                          max={6}
                          className="h-12"
                          {...field}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value) && value >= 1 && value <= 6) {
                              field.onChange(value);
                            }
                          }}
                        />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedFare"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Fare (per person)</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-4">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        className="h-12"
                        {...field}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value >= 0) {
                            field.onChange(value);
                          }
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Enter the estimated fare each participant will need to pay
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showFemaleOnlyToggle && (
              <FormField
                control={form.control}
                name="femaleOnly"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Female Only Ride</FormLabel>
                      <FormDescription>
                        Only female participants can join this ride
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-primary"
                        aria-label="Toggle female only ride"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </form>
        </Form>
      </ScrollArea>

      <div className="sticky bottom-0 left-0 right-0 p-6 bg-background border-t">
        <Button 
          type="submit"
          onClick={form.handleSubmit(onSubmit)}
          className="w-full h-12 active:scale-[0.98] transition-transform touch-none"
        >
          Create Ride
        </Button>
      </div>
    </div>
  );
}