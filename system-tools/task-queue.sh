#!/bin/bash
QUEUE_FILE="$HOME/.openclaw/data/task-queue.json"
LOCK_FILE="/tmp/task-queue.lock"

mkdir -p "$HOME/.openclaw/data"

init_queue() {
    if [ ! -f "$QUEUE_FILE" ]; then
        echo '{"pending":[],"processing":[],"completed":[],"failed":[]}' > "$QUEUE_FILE"
    fi
}

add_task() {
    local task_id=$1
    local task_data=$2
    local timestamp=$(date +%s)
    
    (
        flock -x 200
        init_queue
        
        local task_json="{\"id\":\"$task_id\",\"data\":\"$task_data\",\"timestamp\":$timestamp,\"status\":\"pending\"}"
        local new_queue=$(jq ".pending += [$task_json]" "$QUEUE_FILE")
        echo "$new_queue" > "$QUEUE_FILE"
        
        echo "Task added: $task_id"
    ) 200>"$LOCK_FILE"
}

get_next_task() {
    (
        flock -s 200
        init_queue
        local result=$(jq -r '.pending[0] // empty' "$QUEUE_FILE")
        if [ -z "$result" ] || [ "$result" = "null" ]; then
            echo ""
        else
            echo "$result"
        fi
    ) 200>"$LOCK_FILE"
}

mark_processing() {
    local task_id=$1
    
    (
        flock -x 200
        init_queue
        
        local task_json=$(jq -r ".pending[] | select(.id==\"$task_id\")" "$QUEUE_FILE")
        
        if [ -z "$task_json" ] || [ "$task_json" = "null" ]; then
            echo "Task not found: $task_id"
            return 1
        fi
        
        local new_queue=$(jq ".pending = [.pending[] | select(.id!=\"$task_id\")] | .processing += [$task_json]" "$QUEUE_FILE")
        echo "$new_queue" > "$QUEUE_FILE"
        
        echo "Task processing: $task_id"
    ) 200>"$LOCK_FILE"
}

mark_completed() {
    local task_id=$1
    local result=$2
    
    (
        flock -x 200
        init_queue
        
        local task_json="{\"id\":\"$task_id\",\"result\":\"$result\",\"completedAt\":$(date +%s)}"
        local new_queue=$(jq ".processing = [.processing[] | select(.id!=\"$task_id\")] | .completed += [$task_json]" "$QUEUE_FILE")
        echo "$new_queue" > "$QUEUE_FILE"
        
        echo "Task completed: $task_id"
    ) 200>"$LOCK_FILE"
}

recover_tasks() {
    (
        flock -x 200
        init_queue
        
        local processing_count=$(jq '.processing | length' "$QUEUE_FILE" 2>/dev/null || echo 0)
        
        if [ -n "$processing_count" ] && [ "$processing_count" -gt 0 ] 2>/dev/null; then
            echo "Recovering $processing_count tasks from crash..."
            local new_queue=$(jq ".pending += .processing | .processing = []" "$QUEUE_FILE")
            echo "$new_queue" > "$QUEUE_FILE"
            echo "Recovery complete."
        else
            echo "No tasks to recover."
        fi
    ) 200>"$LOCK_FILE"
}

case "$1" in
    add)
        add_task "$2" "$3"
        ;;
    next)
        get_next_task
        ;;
    process)
        mark_processing "$2"
        ;;
    complete)
        mark_completed "$2" "$3"
        ;;
    recover)
        recover_tasks
        ;;
    *)
        echo "Usage: $0 {add|next|process|complete|recover}"
        ;;
esac
